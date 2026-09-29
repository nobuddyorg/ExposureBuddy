import type { Homography, Point, RansacResult } from '../types';
import { estimateHomography, transferError } from './homography';
import { mulberry32 } from '../features/random';

export interface RansacOptions {
  /** Transfer error in target pixels below which a correspondence is an inlier. */
  readonly threshold: number;
  /** Probability that at least one sample was outlier-free when the adaptive bound stops. */
  readonly confidence: number;
  readonly maxIterations: number;
  /** Uniform generator in [0, 1); inject a seeded one for reproducible runs. */
  readonly random: () => number;
}

export const DEFAULT_RANSAC_SEED = 1;

export const DEFAULT_RANSAC_OPTIONS: Omit<RansacOptions, 'random'> = {
  threshold: 3,
  confidence: 0.995,
  maxIterations: 2000,
};

const SAMPLE_SIZE = 4;

/** The seeded generator RANSAC draws its samples from: mulberry32, shared with the BRIEF pattern. */
export const createRandom = mulberry32;

interface Problem {
  readonly source: readonly Point[];
  readonly target: readonly Point[];
  readonly threshold: number;
}

interface Model {
  readonly homography: Homography;
  readonly inlierMask: Uint8Array;
  readonly inlierCount: number;
}

function countInliers(
  problem: Problem,
  homography: Homography,
  mask: Uint8Array,
): number {
  let count = 0;
  for (let index = 0; index < problem.source.length; index += 1) {
    const error = transferError(
      homography,
      problem.source[index],
      problem.target[index],
    );
    const isInlier = error < problem.threshold ? 1 : 0;
    mask[index] = isInlier;
    count += isInlier;
  }
  return count;
}

// Standard RANSAC bound: iterations until an outlier-free sample was drawn with the given confidence.
function iterationsFor(inlierRatio: number, confidence: number): number {
  const cleanSampleProbability = inlierRatio ** SAMPLE_SIZE;
  return Math.ceil(
    Math.log(1 - confidence) / Math.log(1 - cleanSampleProbability),
  );
}

interface Sample {
  readonly source: Point[];
  readonly target: Point[];
}

// Partial Fisher–Yates over a persistent index permutation; only the four-point sample is allocated per draw.
function createSampler(problem: Problem, random: () => number): () => Sample {
  const count = problem.source.length;
  const indices = Int32Array.from({ length: count }, (_, index) => index);
  return () => {
    const source: Point[] = [];
    const target: Point[] = [];
    for (let slot = 0; slot < SAMPLE_SIZE; slot += 1) {
      const pick = slot + Math.floor(random() * (count - slot));
      const chosen = indices[pick];
      indices[pick] = indices[slot];
      indices[slot] = chosen;
      source.push(problem.source[chosen]);
      target.push(problem.target[chosen]);
    }
    return { source, target };
  };
}

function searchModel(
  problem: Problem,
  options: Omit<RansacOptions, 'threshold'>,
): Model | null {
  const count = problem.source.length;
  const drawSample = createSampler(problem, options.random);
  let best: Model | null = null;
  let scratchMask: Uint8Array = new Uint8Array(count);
  let iterationBound = options.maxIterations;
  for (let iteration = 0; iteration < iterationBound; iteration += 1) {
    const sample = drawSample();
    const candidate = estimateHomography(sample.source, sample.target);
    if (candidate === null) continue;
    const inlierCount = countInliers(problem, candidate, scratchMask);
    // A model must explain more than the best so far, and at least its own sample.
    const countToBeat = best?.inlierCount ?? SAMPLE_SIZE - 1;
    if (inlierCount <= countToBeat) continue;
    const previousMask = best?.inlierMask ?? new Uint8Array(count);
    best = { homography: candidate, inlierMask: scratchMask, inlierCount };
    scratchMask = previousMask;
    iterationBound = Math.min(
      options.maxIterations,
      iterationsFor(inlierCount / count, options.confidence),
    );
  }
  return best;
}

// One least-squares pass over every inlier; kept only when it explains at least as many correspondences.
function refineModel(problem: Problem, model: Model): Model {
  const inlierSource: Point[] = [];
  const inlierTarget: Point[] = [];
  for (let index = 0; index < problem.source.length; index += 1) {
    if (model.inlierMask[index] === 0) continue;
    inlierSource.push(problem.source[index]);
    inlierTarget.push(problem.target[index]);
  }
  // The inliers contain the non-degenerate sample, so the estimate only fails in theory; a null candidate is simply not in the running.
  const candidates = [estimateHomography(inlierSource, inlierTarget)].filter(
    (candidate): candidate is Homography => candidate !== null,
  );
  let best = model;
  for (const homography of candidates) {
    const inlierMask = new Uint8Array(problem.source.length);
    const inlierCount = countInliers(problem, homography, inlierMask);
    if (inlierCount >= best.inlierCount)
      best = { homography, inlierMask, inlierCount };
  }
  return best;
}

/** Returns the RANSAC homography mapping `source` onto `target` with its inlier mask, or null for fewer than 4 correspondences or no usable sample. */
export function ransacHomography(
  source: readonly Point[],
  target: readonly Point[],
  options: Partial<RansacOptions> = {},
): RansacResult | null {
  if (source.length !== target.length) {
    throw new RangeError(
      `ransacHomography: ${source.length} source points but ${target.length} target points`,
    );
  }
  if (source.length < SAMPLE_SIZE) return null;
  const { threshold, confidence, maxIterations } = {
    ...DEFAULT_RANSAC_OPTIONS,
    ...options,
  };
  const random = options.random ?? createRandom(DEFAULT_RANSAC_SEED);
  const problem: Problem = { source, target, threshold };
  const best = searchModel(problem, { confidence, maxIterations, random });
  if (best === null) return null;
  return refineModel(problem, best);
}
