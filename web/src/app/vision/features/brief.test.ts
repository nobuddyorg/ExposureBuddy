import { describe, expect, it } from 'vitest';

import { boxBlurGray } from '../image/blur';
import { DESCRIPTOR_WORDS, type Keypoint } from '../types';
import {
  BRIEF_PAIR_COUNT,
  BRIEF_PATCH_RADIUS,
  BRIEF_PATTERN,
  computeDescriptors,
} from './brief';
import { detectFastCorners } from './fast';
import { intensityCentroidAngle } from './orientation';
import {
  brightSquare,
  centerOf,
  flatGray,
  hammingDistance,
  rotateGray,
  rotatePoint,
  shiftGray,
  texturedScene,
} from './synthetic.test-support';

const BORDER = BRIEF_PATCH_RADIUS + 1;

function orientedCorners(
  image: Parameters<typeof detectFastCorners>[0],
): Keypoint[] {
  return detectFastCorners(image, { border: BORDER }).map((corner) => ({
    ...corner,
    angle: intensityCentroidAngle(image, corner, BRIEF_PATCH_RADIUS),
  }));
}

describe('BRIEF_PATTERN', () => {
  it('holds 256 pairs of offsets clipped to the patch radius', () => {
    expect(BRIEF_PATCH_RADIUS).toBe(15);
    expect(BRIEF_PATTERN).toHaveLength(BRIEF_PAIR_COUNT * 4);
    for (const offset of BRIEF_PATTERN)
      expect(Math.abs(offset)).toBeLessThanOrEqual(15);
  });

  it('samples a centred Gaussian with σ ≈ radius / 5', () => {
    const values = Array.from(BRIEF_PATTERN);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        values.length,
    );
    expect(Math.abs(mean)).toBeLessThan(0.5);
    expect(deviation).toBeGreaterThan(2.3);
    expect(deviation).toBeLessThan(3.7);
    expect(
      values.filter((value) => Math.abs(value) === 15).length,
    ).toBeLessThan(10);
  });
});

describe('computeDescriptors', () => {
  it('returns DESCRIPTOR_WORDS words per keypoint, all zero on a flat image', () => {
    const flat = flatGray(64, 64, 100);
    const keypoints = [
      { x: 20, y: 20, score: 1, angle: 0 },
      { x: 40, y: 30, score: 1, angle: 1 },
    ];
    const descriptors = computeDescriptors(flat, keypoints);
    expect(descriptors).toHaveLength(2 * DESCRIPTOR_WORDS);
    expect(descriptors.every((word) => word === 0)).toBe(true);
    expect(computeDescriptors(flat, [])).toHaveLength(0);
  });

  it('puts pair k in word k / 32 at bit k % 32 and sets it only when I(p1) < I(p2)', () => {
    const image = flatGray(64, 64, 100);
    const pair = 37;
    const targetX = 32 + BRIEF_PATTERN[pair * 4 + 2];
    const targetY = 32 + BRIEF_PATTERN[pair * 4 + 3];
    image.data[targetY * 64 + targetX] = 200;
    const descriptor = computeDescriptors(image, [
      { x: 32, y: 32, score: 1, angle: 0 },
    ]);
    for (let k = 0; k < BRIEF_PAIR_COUNT; k += 1) {
      const firstHitsBright =
        BRIEF_PATTERN[k * 4] === targetX - 32 &&
        BRIEF_PATTERN[k * 4 + 1] === targetY - 32;
      const secondHitsBright =
        BRIEF_PATTERN[k * 4 + 2] === targetX - 32 &&
        BRIEF_PATTERN[k * 4 + 3] === targetY - 32;
      const expectedBit = secondHitsBright && !firstHitsBright ? 1 : 0;
      expect((descriptor[Math.floor(k / 32)] >>> (k % 32)) & 1).toBe(
        expectedBit,
      );
    }
    expect((descriptor[1] >>> 5) & 1).toBe(1);
  });

  it('gives each keypoint its own words, independent of the others in the call', () => {
    const scene = boxBlurGray(texturedScene(), 2);
    const keypoints = orientedCorners(scene).slice(0, 5);
    const together = computeDescriptors(scene, keypoints);
    keypoints.forEach((keypoint, index) => {
      const alone = computeDescriptors(scene, [keypoint]);
      expect(
        together.subarray(
          index * DESCRIPTOR_WORDS,
          (index + 1) * DESCRIPTOR_WORDS,
        ),
      ).toEqual(alone);
    });
  });

  it('is identical for an image and its integer-shifted copy at the shifted keypoints', () => {
    const scene = texturedScene();
    const dx = 5;
    const dy = 3;
    const keypoints = orientedCorners(scene).filter(
      (keypoint) =>
        keypoint.x + dx < scene.width - BORDER &&
        keypoint.y + dy < scene.height - BORDER,
    );
    expect(keypoints.length).toBeGreaterThan(20);
    const shifted = keypoints.map((keypoint) => ({
      ...keypoint,
      x: keypoint.x + dx,
      y: keypoint.y + dy,
    }));
    const original = computeDescriptors(boxBlurGray(scene, 2), keypoints);
    const moved = computeDescriptors(
      boxBlurGray(shiftGray(scene, dx, dy), 2),
      shifted,
    );
    expect(moved).toEqual(original);
  });

  it('steers by the orientation, so a corner rotated by 30° keeps most of its bits', () => {
    const image = brightSquare(200, 200, {
      x: 60,
      y: 60,
      width: 70,
      height: 70,
    });
    const theta = Math.PI / 6;
    const rotated = rotateGray(image, theta);
    const corner = { x: 60, y: 60 };
    const movedCorner = rotatePoint(corner, centerOf(image), theta);
    const keypoint = {
      ...corner,
      score: 1,
      angle: intensityCentroidAngle(image, corner, BRIEF_PATCH_RADIUS),
    };
    const movedKeypoint = {
      x: Math.round(movedCorner.x),
      y: Math.round(movedCorner.y),
      score: 1,
      angle: intensityCentroidAngle(rotated, movedCorner, BRIEF_PATCH_RADIUS),
    };
    const before = computeDescriptors(boxBlurGray(image, 2), [keypoint]);
    const after = computeDescriptors(boxBlurGray(rotated, 2), [movedKeypoint]);
    expect(hammingDistance(before, 0, after, 0)).toBeLessThan(60);
    const unsteered = computeDescriptors(boxBlurGray(rotated, 2), [
      { ...movedKeypoint, angle: keypoint.angle },
    ]);
    expect(hammingDistance(before, 0, unsteered, 0)).toBeGreaterThan(
      hammingDistance(before, 0, after, 0),
    );
  });

  it('keeps most bits of scene corners across a 30° rotation', () => {
    const scene = texturedScene(200, 200);
    const theta = Math.PI / 6;
    const rotated = rotateGray(scene, theta);
    const pivot = centerOf(scene);
    const keypoints = orientedCorners(scene)
      .filter(
        (corner) => Math.hypot(corner.x - pivot.x, corner.y - pivot.y) < 60,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    const moved = keypoints.map((keypoint) => {
      const target = rotatePoint(keypoint, pivot, theta);
      return {
        x: Math.round(target.x),
        y: Math.round(target.y),
        score: keypoint.score,
        angle: intensityCentroidAngle(rotated, target, BRIEF_PATCH_RADIUS),
      };
    });
    const before = computeDescriptors(boxBlurGray(scene, 2), keypoints);
    const after = computeDescriptors(boxBlurGray(rotated, 2), moved);
    const distances = keypoints.map((_, index) =>
      hammingDistance(before, index, after, index),
    );
    const close = distances.filter((distance) => distance < 60).length;
    expect(close).toBeGreaterThanOrEqual(15);
  });

  it('differs in about half of the bits between unrelated keypoints', () => {
    const scene = boxBlurGray(texturedScene(), 2);
    const keypoints = orientedCorners(scene);
    const descriptors = computeDescriptors(scene, keypoints);
    let total = 0;
    let pairs = 0;
    for (let first = 0; first < keypoints.length; first += 1) {
      for (let second = first + 1; second < keypoints.length; second += 1) {
        const apart = Math.hypot(
          keypoints[first].x - keypoints[second].x,
          keypoints[first].y - keypoints[second].y,
        );
        if (apart < 2 * BRIEF_PATCH_RADIUS) continue;
        total += hammingDistance(descriptors, first, descriptors, second);
        pairs += 1;
      }
    }
    expect(pairs).toBeGreaterThan(50);
    expect(Math.abs(total / pairs - 128)).toBeLessThan(40);
  });

  it('clamps samples at the image edge instead of reading outside', () => {
    const scene = texturedScene();
    const descriptors = computeDescriptors(scene, [
      { x: 0, y: 0, score: 1, angle: 0.3 },
      { x: scene.width - 1, y: scene.height - 1, score: 1, angle: -2 },
    ]);
    expect(descriptors).toHaveLength(2 * DESCRIPTOR_WORDS);
    expect(descriptors.some((word) => word !== 0)).toBe(true);
  });
});
