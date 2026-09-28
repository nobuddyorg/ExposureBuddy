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
// The 16 Bresenham-circle offsets of radius 3 as (dx, dy) pairs, clockwise from the top.
const CIRCLE_OFFSETS = new Int8Array([
  0, -3, 1, -3, 2, -2, 3, -1, 3, 0, 3, 1, 2, 2, 1, 3, 0, 3, -1, 3, -2, 2, -3, 1,
  -3, 0, -3, -1, -2, -2, -1, -3,
]);
// Top, right, bottom, left: any arc of 9 contiguous circle pixels contains at least 2 of these.
const COMPASS_PIXELS = [0, 4, 8, 12];
const COMPASS_MINIMUM = 2;

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
  return collectKeypoints(image, scores, margin, nonMaxSuppression);
}

function scoreCorners(
  image: GrayImage,
  threshold: number,
  margin: number,
): Int32Array {
  const { width, height, data } = image;
  const scores = new Int32Array(width * height);
  const circle = circleIndexOffsets(width);
  for (let y = margin; y < height - margin; y += 1) {
    for (let x = margin; x < width - margin; x += 1) {
      const index = y * width + x;
      if (passesCompassCheck(data, index, circle, threshold)) {
        scores[index] = cornerScore(data, index, circle, threshold);
      }
    }
  }
  return scores;
}

function circleIndexOffsets(width: number): Int32Array {
  const offsets = new Int32Array(CIRCLE_PIXELS);
  for (let pixel = 0; pixel < CIRCLE_PIXELS; pixel += 1) {
    offsets[pixel] =
      CIRCLE_OFFSETS[pixel * 2 + 1] * width + CIRCLE_OFFSETS[pixel * 2];
  }
  return offsets;
}

function passesCompassCheck(
  data: Uint8Array,
  index: number,
  circle: Int32Array,
  threshold: number,
): boolean {
  const center = data[index];
  let brighter = 0;
  let darker = 0;
  for (const pixel of COMPASS_PIXELS) {
    const difference = data[index + circle[pixel]] - center;
    if (difference > threshold) brighter += 1;
    else if (difference < -threshold) darker += 1;
  }
  return brighter >= COMPASS_MINIMUM || darker >= COMPASS_MINIMUM;
}

// Returns 0 for a non-corner; a corner's score is positive because every arc pixel exceeds the threshold.
function cornerScore(
  data: Uint8Array,
  index: number,
  circle: Int32Array,
  threshold: number,
): number {
  const center = data[index];
  let brighterMask = 0;
  let darkerMask = 0;
  let brighterScore = 0;
  let darkerScore = 0;
  for (let pixel = 0; pixel < CIRCLE_PIXELS; pixel += 1) {
    const difference = data[index + circle[pixel]] - center;
    if (difference > threshold) {
      brighterMask |= 1 << pixel;
      brighterScore += difference - threshold;
    } else if (difference < -threshold) {
      darkerMask |= 1 << pixel;
      darkerScore += -difference - threshold;
    }
  }
  if (hasContiguousArc(brighterMask)) return brighterScore;
  if (hasContiguousArc(darkerMask)) return darkerScore;
  return 0;
}

function hasContiguousArc(mask: number): boolean {
  // Doubling the 16-bit ring lets an arc that wraps past pixel 15 be read as one straight run.
  const ring = mask | (mask << CIRCLE_PIXELS);
  let run = 0;
  for (let bit = 0; bit < 2 * CIRCLE_PIXELS; bit += 1) {
    run = ring & (1 << bit) ? run + 1 : 0;
    if (run >= ARC_LENGTH) return true;
  }
  return false;
}

function collectKeypoints(
  image: GrayImage,
  scores: Int32Array,
  margin: number,
  nonMaxSuppression: boolean,
): Keypoint[] {
  const { width, height } = image;
  const keypoints: Keypoint[] = [];
  for (let y = margin; y < height - margin; y += 1) {
    for (let x = margin; x < width - margin; x += 1) {
      const index = y * width + x;
      const score = scores[index];
      if (score === 0) continue;
      if (nonMaxSuppression && !isLocalMaximum(scores, index, width)) continue;
      keypoints.push({ x, y, score, angle: 0 });
    }
  }
  return keypoints;
}

function isLocalMaximum(
  scores: Int32Array,
  index: number,
  width: number,
): boolean {
  const score = scores[index];
  for (let rowOffset = -width; rowOffset <= width; rowOffset += width) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      const neighbour = index + rowOffset + columnOffset;
      if (neighbour !== index && scores[neighbour] >= score) return false;
    }
  }
  return true;
}
