import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  saneHomographyArbitrary,
  translationHomography,
} from '../geometry/homography.test-support';
import { identityHomography, invertHomography } from '../geometry/homography';
import type { RgbaImage } from '../types';
import { warpRgba } from './warp';

type Pixel = readonly [number, number, number, number];

function makeImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => Pixel,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(paint(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function pixelAt(image: RgbaImage, x: number, y: number): Pixel {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset],
    image.data[offset + 1],
    image.data[offset + 2],
    image.data[offset + 3],
  ];
}

function coveredCount(coverage: Uint8Array): number {
  return coverage.reduce((sum, flag) => sum + flag, 0);
}

// A deterministic pattern with distinct values per pixel and an alpha that warping must replace.
const patterned = makeImage(16, 12, (x, y) => [
  x * 15,
  y * 20,
  (x + y) * 7,
  100 + x,
]);

describe('warpRgba', () => {
  it('returns the same pixels with alpha 255 and full coverage for the identity', () => {
    const { image, coverage } = warpRgba(
      patterned,
      identityHomography(),
      patterned,
    );
    expect(image.width).toBe(16);
    expect(image.height).toBe(12);
    expect(coveredCount(coverage)).toBe(16 * 12);
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const [r, g, b] = pixelAt(patterned, x, y);
        expect(pixelAt(image, x, y)).toEqual([r, g, b, 255]);
      }
    }
  });

  it('shifts pixels exactly by an integer translation and leaves the uncovered strip empty', () => {
    const { image, coverage } = warpRgba(
      patterned,
      translationHomography(3, 2),
      patterned,
    );
    expect(coveredCount(coverage)).toBe((16 - 3) * (12 - 2));
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const covered = x >= 3 && y >= 2;
        expect(coverage[y * 16 + x]).toBe(covered ? 1 : 0);
        if (covered) {
          const [r, g, b] = pixelAt(patterned, x - 3, y - 2);
          expect(pixelAt(image, x, y)).toEqual([r, g, b, 255]);
        } else {
          expect(pixelAt(image, x, y)).toEqual([0, 0, 0, 0]);
        }
      }
    }
  });

  it('covers only the target pixels that land inside the source for a negative shift and a larger target', () => {
    const { image, coverage } = warpRgba(
      patterned,
      translationHomography(-4, 0),
      { width: 20, height: 12 },
    );
    expect(coveredCount(coverage)).toBe(12 * 12);
    expect(pixelAt(image, 0, 5)).toEqual([4 * 15, 100, 9 * 7, 255]);
    expect(coverage[5 * 20 + 11]).toBe(1);
    expect(coverage[5 * 20 + 12]).toBe(0);
  });

  it('keeps a constant image constant wherever covered, for any sane homography', () => {
    const constant = makeImage(40, 30, () => [37, 200, 91, 255]);
    fc.assert(
      fc.property(saneHomographyArbitrary, (homography) => {
        const { image, coverage } = warpRgba(constant, homography, constant);
        for (let pixel = 0; pixel < coverage.length; pixel += 1) {
          const offset = pixel * 4;
          const expected =
            coverage[pixel] === 1 ? [37, 200, 91, 255] : [0, 0, 0, 0];
          expect(Array.from(image.data.subarray(offset, offset + 4))).toEqual(
            expected,
          );
        }
      }),
    );
  });

  it('interpolates a gradient bilinearly at a half-pixel offset in both axes', () => {
    const gradient = makeImage(12, 10, (x, y) => [x * 20, y * 20, 0, 255]);
    const { image, coverage } = warpRgba(
      gradient,
      translationHomography(0.5, 0.5),
      gradient,
    );
    expect(coverage[0]).toBe(0);
    expect(coverage[1 * 12 + 1]).toBe(1);
    for (let y = 1; y < 10; y += 1) {
      for (let x = 1; x < 12; x += 1) {
        const [r, g] = pixelAt(image, x, y);
        expect(Math.abs(r - (x - 0.5) * 20)).toBeLessThanOrEqual(1);
        expect(Math.abs(g - (y - 0.5) * 20)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('samples the last row and column without reading past the source', () => {
    const { image, coverage } = warpRgba(
      patterned,
      translationHomography(-0.25, -0.25),
      patterned,
    );
    expect(coverage[11 * 16 + 15]).toBe(0);
    expect(coverage[10 * 16 + 14]).toBe(1);
    const [r] = pixelAt(image, 14, 10);
    expect(Math.abs(r - 14.25 * 15)).toBeLessThanOrEqual(1);
  });

  it('leaves a target pixel uncovered when its source position lies behind the camera', () => {
    // Target → source has w = 1 - 0.5x: pixel (3, 0) would sample (4, -0) if the sign of w were ignored.
    const targetToSource = new Float64Array([1, 0, -5, 0, 1, 0, -0.5, 0, 1]);
    const homography = invertHomography(targetToSource);
    expect(homography).not.toBeNull();
    if (homography === null) return;
    const { coverage } = warpRgba(patterned, homography, patterned);
    expect(coverage[3]).toBe(0);
    expect(coverage[0]).toBe(0);
    for (let x = 2; x < 16; x += 1) expect(coverage[x]).toBe(0);
  });

  it('throws on a singular homography', () => {
    expect(() => warpRgba(patterned, new Float64Array(9), patterned)).toThrow(
      /singular/,
    );
  });
});
