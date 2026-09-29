import type { GrayImage, Keypoint } from '../types';

export interface FastOptions {
  /** A circle pixel counts when it differs from the centre by more than this. */
  readonly threshold: number;
  /** Corners closer than this to any image edge are not reported. */
  readonly border: number;
  readonly nonMaxSuppression: boolean;
}

export const DEFAULT_FAST_OPTIONS: FastOptions = {
  threshold: 20,
  border: 16,
  nonMaxSuppression: true,
};

const CIRCLE_RADIUS = 3;
const CIRCLE_PIXELS = 16;
const ARC_LENGTH = 9;
// The 16 Bresenham-circle pixels of radius 3, clockwise from the top, as (x, y) inside the 7 × 7 window around a candidate.
const CIRCLE_WINDOW_XY = new Int8Array([
  3, 0, 4, 0, 5, 1, 6, 2, 6, 3, 6, 4, 5, 5, 4, 6, 3, 6, 2, 6, 1, 5, 0, 4, 0, 3,
  0, 2, 1, 1, 2, 0,
]);
// Top, right, bottom and left are sampled first: any arc of 9 contiguous circle pixels contains at least 2 of them.
const SAMPLE_ORDER = [0, 4, 8, 12, 1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15];
const COMPASS_PIXEL_COUNT = 4;
const COMPASS_MINIMUM = 2;
const FIRST_PIXEL_AFTER_COMPASS = SAMPLE_ORDER[COMPASS_PIXEL_COUNT];

interface Ring {
  /** Each circle pixel's index offset from the top-left of a candidate's 7 × 7 window. */
  readonly pixels: Int32Array;
  /** The candidate's own index offset from that top-left. */
  readonly center: number;
}

/** Returns FAST-9 corners at least `border` px from every edge, angle 0, scored by Σ(|circle − centre| − threshold) over the qualifying arc. */
export function detectFastCorners(
  image: GrayImage,
  options: Partial<FastOptions> = {},
): Keypoint[] {
  const { threshold, border, nonMaxSuppression } = {
    ...DEFAULT_FAST_OPTIONS,
    ...options,
  };
  const margin = Math.max(border, CIRCLE_RADIUS);
  const scores = scoreCorners(image, threshold, margin);
  return collectKeypoints(image.width, scores, nonMaxSuppression);
}

function scoreCorners(
  image: GrayImage,
  threshold: number,
  margin: number,
): Int32Array {
  const { width, height, data } = image;
  const scores = new Int32Array(width * height);
  const ring = ringOffsets(width);
  for (let y = margin; y < height - margin; y += 1) {
    for (let x = margin; x < width - margin; x += 1) {
      const index = y * width + x;
      scores[index] = cornerScore(data, index, ring, threshold);
    }
  }
  return scores;
}

function ringOffsets(width: number): Ring {
  return {
    pixels: Int32Array.from(
      { length: CIRCLE_PIXELS },
      (_, pixel) =>
        CIRCLE_WINDOW_XY[pixel * 2 + 1] * width + CIRCLE_WINDOW_XY[pixel * 2],
    ),
    center: CIRCLE_RADIUS * width + CIRCLE_RADIUS,
  };
}

// Returns 0 for a non-corner; a corner's score is positive because every arc pixel exceeds the threshold.
function cornerScore(
  data: Uint8Array,
  index: number,
  ring: Ring,
  threshold: number,
): number {
  const center = data[index];
  const windowStart = index - ring.center;
  let brighter = 0;
  let darker = 0;
  let brighterMask = 0;
  let darkerMask = 0;
  let brighterScore = 0;
  let darkerScore = 0;
  for (const pixel of SAMPLE_ORDER) {
    // Fewer than two compass hits per sign rules out every arc, so the other twelve pixels are never read.
    if (
      pixel === FIRST_PIXEL_AFTER_COMPASS &&
      brighter < COMPASS_MINIMUM &&
      darker < COMPASS_MINIMUM
    ) {
      return 0;
    }
    const difference = data[windowStart + ring.pixels[pixel]] - center;
    if (difference > threshold) {
      brighter += 1;
      brighterMask |= 1 << pixel;
      brighterScore += difference - threshold;
    } else if (difference < -threshold) {
      darker += 1;
      darkerMask |= 1 << pixel;
      darkerScore += -difference - threshold;
    }
  }
  if (hasContiguousArc(brighterMask)) return brighterScore;
  if (hasContiguousArc(darkerMask)) return darkerScore;
  return 0;
}

function hasContiguousArc(mask: number): boolean {
  let run = 0;
  // Doubling the 16-bit ring lets an arc that wraps past pixel 15 be read as one straight run.
  for (let ring = mask | (mask << CIRCLE_PIXELS); ring !== 0; ring >>>= 1) {
    run = ring & 1 ? run + 1 : 0;
    if (run >= ARC_LENGTH) return true;
  }
  return false;
}

function collectKeypoints(
  width: number,
  scores: Int32Array,
  nonMaxSuppression: boolean,
): Keypoint[] {
  const keypoints: Keypoint[] = [];
  for (let index = 0; index < scores.length; index += 1) {
    const score = scores[index];
    if (score === 0) continue;
    if (nonMaxSuppression && !isLocalMaximum(scores, index, width)) continue;
    keypoints.push({
      x: index % width,
      y: Math.floor(index / width),
      score,
      angle: 0,
    });
  }
  return keypoints;
}

function isLocalMaximum(
  scores: Int32Array,
  index: number,
  width: number,
): boolean {
  const score = scores[index];
  for (const row of [index - width, index, index + width]) {
    for (const neighbour of [row - 1, row, row + 1]) {
      if (neighbour !== index && scores[neighbour] >= score) return false;
    }
  }
  return true;
}
