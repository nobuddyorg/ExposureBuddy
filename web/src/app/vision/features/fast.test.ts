import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { GrayImage, Keypoint } from '../types';
import { DEFAULT_FAST_OPTIONS, detectFastCorners } from './fast';
import {
  brightSquare,
  flatGray,
  texturedScene,
} from './synthetic.test-support';

const CIRCLE: readonly (readonly [number, number])[] = [
  [0, -3],
  [1, -3],
  [2, -2],
  [3, -1],
  [3, 0],
  [3, 1],
  [2, 2],
  [1, 3],
  [0, 3],
  [-1, 3],
  [-2, 2],
  [-3, 1],
  [-3, 0],
  [-3, -1],
  [-2, -2],
  [-1, -3],
];

// Plain-loop FAST-9 without the compass pre-check, the oracle the detector must agree with.
function referenceScore(
  image: GrayImage,
  x: number,
  y: number,
  threshold: number,
): number {
  const center = image.data[y * image.width + x];
  const ring = CIRCLE.map(
    ([dx, dy]) => image.data[(y + dy) * image.width + x + dx] - center,
  );
  for (const sign of [1, -1]) {
    const qualifies = ring.map((difference) => sign * difference > threshold);
    for (let start = 0; start < 16; start += 1) {
      let contiguous = true;
      for (let step = 0; step < 9; step += 1)
        contiguous &&= qualifies[(start + step) % 16];
      if (contiguous) {
        return ring.reduce(
          (sum, difference, pixel) =>
            sum + (qualifies[pixel] ? Math.abs(difference) - threshold : 0),
          0,
        );
      }
    }
  }
  return 0;
}

function referenceCorners(
  image: GrayImage,
  threshold: number,
  border: number,
  nonMaxSuppression: boolean,
): Keypoint[] {
  const margin = Math.max(border, 3);
  const scores = new Int32Array(image.width * image.height);
  for (let y = margin; y < image.height - margin; y += 1) {
    for (let x = margin; x < image.width - margin; x += 1) {
      scores[y * image.width + x] = referenceScore(image, x, y, threshold);
    }
  }
  const corners: Keypoint[] = [];
  for (let y = margin; y < image.height - margin; y += 1) {
    for (let x = margin; x < image.width - margin; x += 1) {
      const score = scores[y * image.width + x];
      if (score === 0) continue;
      let maximal = true;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (
            (dx !== 0 || dy !== 0) &&
            scores[(y + dy) * image.width + x + dx] >= score
          )
            maximal = false;
        }
      }
      if (!nonMaxSuppression || maximal)
        corners.push({ x, y, score, angle: 0 });
    }
  }
  return corners;
}

const noisyImage = fc
  .array(fc.integer({ min: 0, max: 255 }), {
    minLength: 24 * 24,
    maxLength: 24 * 24,
  })
  .map((values): GrayImage => ({
    width: 24,
    height: 24,
    data: new Uint8Array(values),
  }));

function near(
  keypoints: readonly Keypoint[],
  x: number,
  y: number,
): Keypoint[] {
  return keypoints.filter(
    (keypoint) =>
      Math.abs(keypoint.x - x) <= 1 && Math.abs(keypoint.y - y) <= 1,
  );
}

describe('detectFastCorners', () => {
  const square = { x: 30, y: 30, width: 40, height: 40 };
  const image = brightSquare(100, 100, square);

  it('defaults to threshold 20, border 16 and non-max suppression', () => {
    expect(DEFAULT_FAST_OPTIONS).toEqual({
      threshold: 20,
      border: 16,
      nonMaxSuppression: true,
    });
  });

  it('finds nothing on a flat image', () => {
    expect(detectFastCorners(flatGray(64, 64, 128))).toEqual([]);
  });

  it('finds the four corners of a bright square within 1 px, one keypoint each, angle 0', () => {
    const corners = detectFastCorners(image);
    expect(corners).toHaveLength(4);
    for (const [x, y] of [
      [30, 30],
      [69, 30],
      [30, 69],
      [69, 69],
    ]) {
      expect(near(corners, x, y)).toHaveLength(1);
    }
    for (const corner of corners) {
      expect(corner.angle).toBe(0);
      expect(corner.score).toBeGreaterThan(0);
    }
  });

  it('reports several responses per corner without non-max suppression', () => {
    const unsuppressed = detectFastCorners(image, { nonMaxSuppression: false });
    expect(unsuppressed.length).toBeGreaterThan(4);
    expect(near(unsuppressed, 30, 30).length).toBeGreaterThan(1);
  });

  it('keeps every corner at least `border` px from every edge', () => {
    const nearEdge = brightSquare(100, 100, {
      x: 10,
      y: 10,
      width: 40,
      height: 40,
    });
    const withDefaultBorder = detectFastCorners(nearEdge);
    expect(withDefaultBorder).toHaveLength(1);
    expect(near(withDefaultBorder, 49, 49)).toHaveLength(1);
    const withSmallBorder = detectFastCorners(nearEdge, { border: 3 });
    expect(withSmallBorder).toHaveLength(4);
    expect(near(withSmallBorder, 10, 10)).toHaveLength(1);
    for (const corner of detectFastCorners(texturedScene(), { border: 20 })) {
      expect(corner.x).toBeGreaterThanOrEqual(20);
      expect(corner.y).toBeGreaterThanOrEqual(20);
      expect(corner.x).toBeLessThan(140);
      expect(corner.y).toBeLessThan(100);
    }
  });

  it('finds no corner along a straight edge', () => {
    const corners = detectFastCorners(image, { nonMaxSuppression: false });
    expect(
      corners.filter((corner) => corner.y === 50 || corner.x === 50),
    ).toEqual([]);
  });

  it('finds nothing once the threshold exceeds the contrast', () => {
    expect(detectFastCorners(image, { threshold: 200 })).toEqual([]);
  });

  it('finds fewer corners at a higher threshold, all of them present at the lower one', () => {
    const scene = texturedScene();
    const loose = detectFastCorners(scene, {
      threshold: 10,
      nonMaxSuppression: false,
    });
    const strict = detectFastCorners(scene, {
      threshold: 40,
      nonMaxSuppression: false,
    });
    expect(strict.length).toBeLessThan(loose.length);
    const loosePositions = new Set(
      loose.map((corner) => `${corner.x},${corner.y}`),
    );
    for (const corner of strict)
      expect(loosePositions.has(`${corner.x},${corner.y}`)).toBe(true);
  });

  it('agrees with a plain FAST-9 oracle on noisy images, so the pre-check rejects no true corner', () => {
    fc.assert(
      fc.property(
        noisyImage,
        fc.integer({ min: 5, max: 60 }),
        fc.boolean(),
        (noisy, threshold, nonMaxSuppression) => {
          const detected = detectFastCorners(noisy, {
            threshold,
            border: 3,
            nonMaxSuppression,
          });
          expect(detected).toEqual(
            referenceCorners(noisy, threshold, 3, nonMaxSuppression),
          );
        },
      ),
      { numRuns: 80 },
    );
  });
});
