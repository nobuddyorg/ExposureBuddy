import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { GrayImage } from '../types';
import { boxBlurGray } from './blur';
import { sharpness } from './sharpness';

function gray(
  width: number,
  height: number,
  valueAt: (x: number, y: number) => number,
): GrayImage {
  const data = new Uint8Array(width * height).map((_, at) =>
    valueAt(at % width, Math.floor(at / width)),
  );
  return { width, height, data };
}

/** Squares of 8 px, alternating `low` and `high`: large structure with crisp edges, like a scene. */
const checkerboard = (width: number, height: number, low = 20, high = 120) =>
  gray(width, height, (x, y) => (((x >> 3) + (y >> 3)) % 2 === 0 ? low : high));

describe('sharpness', () => {
  it('is the Laplacian variance over the pixel variance, interior only', () => {
    // One bright pixel in the middle of 5 × 5: the interior 3 × 3 holds it, its four neighbours and four corners.
    const impulse = gray(5, 5, (x, y) => (x === 2 && y === 2 ? 90 : 0));
    // Laplacians: −360 once, 90 four times, 0 four times; pixels: 90 once, 0 eight times.
    const laplacianVariance = (360 ** 2 + 4 * 90 ** 2) / 9 - 0;
    const pixelVariance = 90 ** 2 / 9 - (90 / 9) ** 2;
    expect(sharpness(impulse)).toBeCloseTo(
      laplacianVariance / pixelVariance,
      10,
    );
  });

  it('is 0 without contrast or without an interior', () => {
    expect(sharpness(gray(8, 6, () => 77))).toBe(0);
    // Contrast on the border only: the interior pixels do not vary.
    expect(
      sharpness(gray(6, 6, (x, y) => (x === 0 || y === 5 ? 200 : 10))),
    ).toBe(0);
    expect(sharpness(gray(2, 9, (x) => x * 200))).toBe(0);
    expect(sharpness(gray(9, 2, (x) => x * 20))).toBe(0);
  });

  it('is 0 for a smooth curve, whose Laplacian is the same everywhere', () => {
    // 3x² along each row: the Laplacian is 6 at every interior pixel.
    expect(sharpness(gray(9, 5, (x) => 3 * x * x))).toBe(0);
  });

  it('drops once the image is blurred', () => {
    const crisp = checkerboard(40, 30);
    expect(sharpness(boxBlurGray(crisp, 1))).toBeLessThan(sharpness(crisp) / 2);
  });

  it('ignores exposure: brighter or with more contrast, the same scene is as sharp', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 1, max: 60 }),
        (offset, contrast) => {
          const dim = checkerboard(16, 12, 0, contrast);
          const bright = checkerboard(16, 12, offset, offset + 2 * contrast);
          expect(sharpness(bright)).toBeCloseTo(sharpness(dim), 10);
        },
      ),
    );
  });
});
