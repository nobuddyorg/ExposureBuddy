import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { GrayImage, RgbaImage } from '../types';
import { fitWithin, resizeGray, resizeRgba } from './resize';

function checkerboard(width: number, height: number, cell: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      data[y * width + x] = dark ? 0 : 200;
    }
  }
  return { width, height, data };
}

describe('fitWithin', () => {
  it('shrinks the long edge to the limit and keeps the aspect', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1000)).toEqual({
      width: 1000,
      height: 750,
      scale: 0.25,
    });
    expect(fitWithin({ width: 300, height: 900 }, 300)).toEqual({
      width: 100,
      height: 300,
      scale: 1 / 3,
    });
  });

  it('never upscales', () => {
    expect(fitWithin({ width: 320, height: 200 }, 1000)).toEqual({
      width: 320,
      height: 200,
      scale: 1,
    });
  });

  it('rounds and keeps every edge at least 1 px', () => {
    expect(fitWithin({ width: 1000, height: 1 }, 10)).toEqual({
      width: 10,
      height: 1,
      scale: 0.01,
    });
  });

  it('keeps scale ≤ 1, the long edge within the limit and the aspect, for any size', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 5000 }),
        (width, height, maxLongEdge) => {
          const fitted = fitWithin({ width, height }, maxLongEdge);
          expect(fitted.scale).toBeLessThanOrEqual(1);
          expect(fitted.scale).toBeGreaterThan(0);
          expect(Math.max(fitted.width, fitted.height)).toBeLessThanOrEqual(
            Math.max(maxLongEdge, 1),
          );
          // Below 2 px an edge is held at 1 by the clamp, which rightly breaks the aspect.
          if (Math.min(fitted.width, fitted.height) < 2) return;
          const originalAspect = width / height;
          const fittedAspect = fitted.width / fitted.height;
          const roundingTolerance = 1.5 / Math.min(fitted.width, fitted.height);
          expect(
            Math.abs(fittedAspect / originalAspect - 1),
          ).toBeLessThanOrEqual(roundingTolerance);
        },
      ),
    );
  });
});

describe('resizeGray', () => {
  it('returns a copy at the same size', () => {
    const image = checkerboard(6, 4, 1);
    const copy = resizeGray(image, { width: 6, height: 4 });
    expect(copy.data).toEqual(image.data);
    expect(copy.data).not.toBe(image.data);
  });

  it('averages the footprint when shrinking, so a checkerboard becomes its mean', () => {
    const shrunk = resizeGray(checkerboard(16, 8, 1), { width: 4, height: 2 });
    expect(Array.from(shrunk.data)).toEqual(new Array<number>(8).fill(100));
  });

  it('weights partial source pixels when the ratio is fractional', () => {
    const source: GrayImage = {
      width: 3,
      height: 1,
      data: new Uint8Array([0, 90, 180]),
    };
    // Each target pixel spans 1.5 source pixels: (0 + 90 / 2) / 1.5 and (90 / 2 + 180) / 1.5.
    expect(
      Array.from(resizeGray(source, { width: 2, height: 1 }).data),
    ).toEqual([30, 150]);
  });

  it('interpolates monotonically when upscaling a 2×2 gradient', () => {
    const gradient: GrayImage = {
      width: 2,
      height: 2,
      data: new Uint8Array([0, 100, 100, 200]),
    };
    const up = resizeGray(gradient, { width: 8, height: 8 });
    for (let y = 0; y < 8; y += 1) {
      for (let x = 1; x < 8; x += 1) {
        expect(up.data[y * 8 + x]).toBeGreaterThanOrEqual(
          up.data[y * 8 + x - 1],
        );
        expect(up.data[x * 8 + y]).toBeGreaterThanOrEqual(
          up.data[(x - 1) * 8 + y],
        );
      }
    }
    expect(up.data[0]).toBe(0);
    expect(up.data[63]).toBe(200);
    expect(up.data[7]).toBe(100);
  });

  it('uses bilinear sampling when one edge grows and the other shrinks', () => {
    const flat: GrayImage = {
      width: 4,
      height: 2,
      data: new Uint8Array(8).fill(77),
    };
    const mixed = resizeGray(flat, { width: 2, height: 4 });
    expect(Array.from(mixed.data)).toEqual(new Array<number>(8).fill(77));
  });

  it('preserves a constant image at any target size', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 255 }),
        (width, height, targetWidth, targetHeight, value) => {
          const flat = {
            width,
            height,
            data: new Uint8Array(width * height).fill(value),
          };
          const resized = resizeGray(flat, {
            width: targetWidth,
            height: targetHeight,
          });
          expect(resized.data.length).toBe(targetWidth * targetHeight);
          expect(resized.data.every((pixel) => pixel === value)).toBe(true);
        },
      ),
    );
  });
});

describe('resizeRgba', () => {
  it('shrinks each channel independently', () => {
    const data = new Uint8ClampedArray(2 * 2 * 4);
    data.set([
      0, 255, 10, 255, 100, 255, 30, 255, 0, 255, 10, 255, 100, 255, 30, 255,
    ]);
    const image: RgbaImage = { width: 2, height: 2, data };
    const shrunk = resizeRgba(image, { width: 1, height: 1 });
    expect(Array.from(shrunk.data)).toEqual([50, 255, 20, 255]);
  });

  it('returns a copy at the same size and keeps alpha when upscaling', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 50, 60, 70, 255]);
    const image: RgbaImage = { width: 2, height: 1, data };
    const copy = resizeRgba(image, { width: 2, height: 1 });
    expect(copy.data).toEqual(data);
    expect(copy.data).not.toBe(data);
    const up = resizeRgba(image, { width: 4, height: 1 });
    expect(Array.from(up.data.filter((_, index) => index % 4 === 3))).toEqual([
      255, 255, 255, 255,
    ]);
    expect(up.data[0]).toBe(10);
    expect(up.data[12]).toBe(50);
  });
});
