import type { Homography, Point, Size } from '../types';
import {
  accumulateDltSystem,
  hasCollinearTriple,
  normalisePoints,
} from './dlt';
import { jacobiEigen, smallestEigenvector } from './jacobi';

const HOMOGRAPHY_ENTRIES = 9;
const MIN_CORRESPONDENCES = 4;
// |h[8]| at or below this is left alone: dividing would blow the matrix up.
const NORMALISATION_EPSILON = 1e-12;
// A determinant this small relative to its terms is cancellation, i.e. a singular matrix.
const SINGULAR_RATIO = 1e-12;
// The second-smallest eigenvalue of AᵀA this close to zero means a rank-deficient system.
const RANK_DEFICIENT_RATIO = 1e-10;

function normaliseInPlace(h: Homography): Homography {
  const w = h[8];
  if (Math.abs(w) <= NORMALISATION_EPSILON) return h;
  for (let index = 0; index < HOMOGRAPHY_ENTRIES; index += 1) h[index] /= w;
  return h;
}

function multiply(left: Homography, right: Homography): Homography {
  const product = new Float64Array(HOMOGRAPHY_ENTRIES);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      product[row * 3 + column] =
        left[row * 3] * right[column] +
        left[row * 3 + 1] * right[3 + column] +
        left[row * 3 + 2] * right[6 + column];
    }
  }
  return product;
}

function isFiniteHomography(h: Homography): boolean {
  for (let index = 0; index < HOMOGRAPHY_ENTRIES; index += 1) {
    if (!Number.isFinite(h[index])) return false;
  }
  return true;
}

/** Returns the identity transform as a row-major Float64Array(9). */
export function identityHomography(): Homography {
  const h = new Float64Array(HOMOGRAPHY_ENTRIES);
  h[0] = 1;
  h[4] = 1;
  h[8] = 1;
  return h;
}

/** Returns `point` mapped through `h` into target pixel coordinates. */
export function applyHomography(h: Homography, point: Point): Point {
  const w = h[6] * point.x + h[7] * point.y + h[8];
  return {
    x: (h[0] * point.x + h[1] * point.y + h[2]) / w,
    y: (h[3] * point.x + h[4] * point.y + h[5]) / w,
  };
}

/** Returns the normalised inverse (target → source), or null when `h` is singular. */
export function invertHomography(h: Homography): Homography | null {
  const [a, b, c, d, e, f, g, k, i] = h;
  const cofactorA = e * i - f * k;
  const cofactorB = f * g - d * i;
  const cofactorC = d * k - e * g;
  const determinant = a * cofactorA + b * cofactorB + c * cofactorC;
  const magnitude =
    Math.abs(a * cofactorA) + Math.abs(b * cofactorB) + Math.abs(c * cofactorC);
  if (Math.abs(determinant) <= SINGULAR_RATIO * magnitude) return null;
  const inverse = new Float64Array([
    cofactorA,
    c * k - b * i,
    b * f - c * e,
    cofactorB,
    a * i - c * g,
    c * d - a * f,
    cofactorC,
    b * g - a * k,
    a * e - b * d,
  ]);
  for (let index = 0; index < HOMOGRAPHY_ENTRIES; index += 1) {
    inverse[index] /= determinant;
  }
  return isFiniteHomography(inverse) ? normaliseInPlace(inverse) : null;
}

/** Returns the transform that applies `inner` first, then `outer` (the matrix product outer · inner), normalised. */
export function composeHomographies(
  outer: Homography,
  inner: Homography,
): Homography {
  return normaliseInPlace(multiply(outer, inner));
}

/** Returns the same transform expressed in coordinates multiplied by `factor` on both sides. */
export function scaleHomography(h: Homography, factor: number): Homography {
  const scaled = Float64Array.from(h);
  scaled[2] *= factor;
  scaled[5] *= factor;
  scaled[6] /= factor;
  scaled[7] /= factor;
  return normaliseInPlace(scaled);
}

/** Returns the Euclidean distance in target pixels between H·source and target. */
export function transferError(
  h: Homography,
  source: Point,
  target: Point,
): number {
  const mapped = applyHomography(h, source);
  return Math.hypot(mapped.x - target.x, mapped.y - target.y);
}

function isRankDeficient(values: Float64Array): boolean {
  const sorted = Float64Array.from(values).sort();
  const largest = sorted[sorted.length - 1];
  return sorted[1] <= RANK_DEFICIENT_RATIO * largest;
}

/** Returns the normalised-DLT homography mapping `source` onto `target`, or null for fewer than 4 points, a degenerate configuration or a non-finite result. */
export function estimateHomography(
  source: readonly Point[],
  target: readonly Point[],
): Homography | null {
  if (source.length !== target.length) {
    throw new RangeError(
      `estimateHomography: ${source.length} source points but ${target.length} target points`,
    );
  }
  if (source.length < MIN_CORRESPONDENCES) return null;
  if (
    source.length === MIN_CORRESPONDENCES &&
    (hasCollinearTriple(source) || hasCollinearTriple(target))
  ) {
    return null;
  }
  const normalisedSource = normalisePoints(source);
  const normalisedTarget = normalisePoints(target);
  if (normalisedSource === null || normalisedTarget === null) return null;
  const eigen = jacobiEigen(
    accumulateDltSystem(
      normalisedSource.coordinates,
      normalisedTarget.coordinates,
    ),
    HOMOGRAPHY_ENTRIES,
  );
  if (isRankDeficient(eigen.values)) return null;
  const h = normaliseInPlace(
    multiply(
      multiply(normalisedTarget.fromNormalised, smallestEigenvector(eigen)),
      normalisedSource.toNormalised,
    ),
  );
  return isFiniteHomography(h) ? h : null;
}

export interface SanityLimits {
  /** Smallest singular value of the affine part still accepted. */
  readonly minScale: number;
  /** Largest singular value of the affine part still accepted. */
  readonly maxScale: number;
  /** Largest |h[6]|, |h[7]| accepted, per pixel. */
  readonly maxPerspective: number;
}

export const DEFAULT_SANITY_LIMITS: SanityLimits = {
  minScale: 0.7,
  maxScale: 1.4,
  maxPerspective: 0.0005,
};

function mapsCornersToConvexQuad(h: Homography, frame: Size): boolean {
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: frame.width, y: 0 },
    { x: frame.width, y: frame.height },
    { x: 0, y: frame.height },
  ];
  const mapped: Point[] = [];
  for (const corner of corners) {
    const depth = h[6] * corner.x + h[7] * corner.y + h[8];
    if (depth <= 0) return false;
    mapped.push(applyHomography(h, corner));
  }
  let smallestTurn = Number.POSITIVE_INFINITY;
  for (let index = 0; index < mapped.length; index += 1) {
    const a = mapped[index];
    const b = mapped[(index + 1) % mapped.length];
    const c = mapped[(index + 2) % mapped.length];
    const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    smallestTurn = Math.min(smallestTurn, turn);
  }
  // Math.min propagates a NaN turn from an overflowed corner, so that quad fails too.
  return smallestTurn > 0;
}

// Singular values of the 2×2 affine part [h0 h1; h3 h4], largest first.
function affineSingularValues(h: Homography): [number, number] {
  const sum = (h[0] + h[4]) / 2;
  const difference = (h[0] - h[4]) / 2;
  const shearSum = (h[3] + h[1]) / 2;
  const shearDifference = (h[3] - h[1]) / 2;
  const major = Math.hypot(sum, shearDifference);
  const minor = Math.hypot(difference, shearSum);
  return [major + minor, Math.abs(major - minor)];
}

/** Returns true when `h` (normalised first) is a plausible handheld-burst motion of `frame`: convex non-mirrored corner quad, bounded scale and perspective. */
export function isSaneHomography(
  h: Homography,
  frame: Size,
  limits: Partial<SanityLimits> = {},
): boolean {
  const { minScale, maxScale, maxPerspective } = {
    ...DEFAULT_SANITY_LIMITS,
    ...limits,
  };
  if (!isFiniteHomography(h) || Math.abs(h[8]) <= NORMALISATION_EPSILON) {
    return false;
  }
  const normalised = normaliseInPlace(Float64Array.from(h));
  if (
    Math.abs(normalised[6]) > maxPerspective ||
    Math.abs(normalised[7]) > maxPerspective
  ) {
    return false;
  }
  const [largest, smallest] = affineSingularValues(normalised);
  if (smallest < minScale || largest > maxScale) return false;
  return mapsCornersToConvexQuad(normalised, frame);
}
