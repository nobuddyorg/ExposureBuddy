import { DESCRIPTOR_WORDS, type GrayImage, type Keypoint } from '../types';
import { mulberry32, standardNormal } from './random';
import { indices } from '../indices';

/** Half the side of the square patch a descriptor samples; keypoints need this much room plus one pixel. */
export const BRIEF_PATCH_RADIUS = 15;
export const BRIEF_PAIR_COUNT = 256;
const PATTERN_SEED = 0x0b51ef;
const SAMPLE_SIGMA = BRIEF_PATCH_RADIUS / 5;
const BITS_PER_WORD = 32;

/** 256 test pairs as (x1, y1, x2, y2) offsets from the keypoint, Gaussian (σ = radius / 5) and clipped to ±BRIEF_PATCH_RADIUS. */
export const BRIEF_PATTERN: Int8Array = generatePattern();
const PAIRS = indices(BRIEF_PAIR_COUNT);

function generatePattern(): Int8Array {
  const nextUniform = mulberry32(PATTERN_SEED);
  return Int8Array.from({ length: BRIEF_PAIR_COUNT * 4 }, () =>
    clampToPatch(Math.round(standardNormal(nextUniform) * SAMPLE_SIGMA)),
  );
}

function clampToPatch(offset: number): number {
  return Math.min(Math.max(offset, -BRIEF_PATCH_RADIUS), BRIEF_PATCH_RADIUS);
}

/** Returns steered-BRIEF descriptors, DESCRIPTOR_WORDS words per keypoint; bit k (word k / 32, bit k % 32) is 1 when I(p1) < I(p2) for pair k rotated by the keypoint's angle. */
export function computeDescriptors(
  smoothed: GrayImage,
  keypoints: readonly Keypoint[],
): Uint32Array {
  const descriptors = new Uint32Array(keypoints.length * DESCRIPTOR_WORDS);
  for (let index = 0; index < keypoints.length; index += 1) {
    describeKeypoint(
      smoothed,
      keypoints[index],
      descriptors,
      index * DESCRIPTOR_WORDS,
    );
  }
  return descriptors;
}

function describeKeypoint(
  image: GrayImage,
  keypoint: Keypoint,
  descriptors: Uint32Array,
  wordOffset: number,
): void {
  const { width, height, data } = image;
  const cosine = Math.cos(keypoint.angle);
  const sine = Math.sin(keypoint.angle);
  const centerX = Math.round(keypoint.x);
  const centerY = Math.round(keypoint.y);
  const lastX = width - 1;
  const lastY = height - 1;
  for (const pair of PAIRS) {
    const patternOffset = pair * 4;
    const firstX = BRIEF_PATTERN[patternOffset];
    const firstY = BRIEF_PATTERN[patternOffset + 1];
    const secondX = BRIEF_PATTERN[patternOffset + 2];
    const secondY = BRIEF_PATTERN[patternOffset + 3];
    const firstIndex =
      clamp(centerY + Math.round(sine * firstX + cosine * firstY), lastY) *
        width +
      clamp(centerX + Math.round(cosine * firstX - sine * firstY), lastX);
    const secondIndex =
      clamp(centerY + Math.round(sine * secondX + cosine * secondY), lastY) *
        width +
      clamp(centerX + Math.round(cosine * secondX - sine * secondY), lastX);
    if (data[firstIndex] < data[secondIndex]) {
      descriptors[wordOffset + (pair >> 5)] |= 1 << (pair % BITS_PER_WORD);
    }
  }
}

function clamp(coordinate: number, last: number): number {
  return Math.min(Math.max(coordinate, 0), last);
}
