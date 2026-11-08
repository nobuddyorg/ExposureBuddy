import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { seededRandom } from '../golden.test-support';
import type { GrayImage } from '../types';
import {
  CLEAN_NOISE,
  denoiseRadius,
  NOISY_NOISE,
  noiseLevel,
} from './noiseLevel';

const SCALE = Math.sqrt(Math.PI / 2) / 6;

function gray(
  width: number,
  height: number,
  at: (x: number, y: number) => number,
): GrayImage {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) data[y * width + x] = at(x, y);
  return { width, height, data };
}

describe('noiseLevel', () => {
  it('is 0 for a flat image, a plane and a ramp, which carry no noise', () => {
    expect(noiseLevel(gray(8, 8, () => 77))).toBe(0);
    expect(noiseLevel(gray(8, 8, (x) => x * 10))).toBe(0);
    expect(noiseLevel(gray(8, 8, (x, y) => x * 5 + y * 7))).toBe(0);
  });

  it('is the scaled response of the mask for a single bright point: 4 · value on a 3 × 3 image', () => {
    const point = gray(3, 3, (x, y) => (x === 1 && y === 1 ? 10 : 0));
    expect(noiseLevel(point)).toBeCloseTo(SCALE * 40, 12);
  });

  it('averages the response over every 3 × 3 window', () => {
    const point = gray(5, 3, (x, y) => (x === 2 && y === 1 ? 10 : 0));
    // Windows at x = 0 and x = 2 see the point off-centre at the edge (weight −2 → 20) and in the middle (weight 4 → 40); x = 1 sees it at the edge too.
    expect(noiseLevel(point)).toBeCloseTo((SCALE * (20 + 20 + 40)) / 3, 12);
  });

  it('reads the standard deviation of seeded noise to within 10 %', () => {
    for (const sigma of [3, 8, 16]) {
      const random = seededRandom(sigma);
      const noisy = gray(96, 96, () => {
        const normal =
          Math.sqrt(-2 * Math.log(1 - random())) *
          Math.cos(2 * Math.PI * random());
        return Math.round(128 + sigma * normal);
      });
      expect(noiseLevel(noisy)).toBeGreaterThan(sigma * 0.9);
      expect(noiseLevel(noisy)).toBeLessThan(sigma * 1.1);
    }
  });

  it('has nothing to measure on an image smaller than the mask', () => {
    expect(noiseLevel(gray(2, 9, () => 5))).toBe(0);
    expect(noiseLevel(gray(9, 2, () => 5))).toBe(0);
  });

  it('never goes below 0 and is unchanged by a uniform brightening', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 36, maxLength: 36 }), (values) => {
        const image = { width: 6, height: 6, data: values.map((v) => v / 2) };
        const brighter = { ...image, data: image.data.map((v) => v + 100) };
        expect(noiseLevel(image)).toBeGreaterThanOrEqual(0);
        expect(noiseLevel(brighter)).toBeCloseTo(noiseLevel(image), 9);
      }),
    );
  });
});

describe('denoiseRadius', () => {
  it('leaves a clean photo alone', () => {
    expect(denoiseRadius(0)).toBe(0);
    expect(denoiseRadius(CLEAN_NOISE - 0.01)).toBe(0);
  });

  it('smooths one pixel from the clean limit up to the noisy one, then two', () => {
    expect(denoiseRadius(CLEAN_NOISE)).toBe(1);
    expect(denoiseRadius(NOISY_NOISE - 0.01)).toBe(1);
    expect(denoiseRadius(NOISY_NOISE)).toBe(2);
    expect(denoiseRadius(80)).toBe(2);
  });
});
