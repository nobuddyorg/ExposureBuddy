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

function gray(width: number, height: number, values: number[]): GrayImage {
  return { width, height, data: new Uint8Array(values) };
}

/** Rounded mean of each `factor`×`factor` block, the answer an area average must give at an integer ratio. */
function blockMeans(image: GrayImage, factor: number): number[] {
  const width = image.width / factor;
  const height = image.height / factor;
  const means: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) {
          sum += image.data[(y * factor + dy) * image.width + x * factor + dx];
        }
      }
      means.push(Math.round(sum / (factor * factor)));
    }
  }
  return means;
}

type Rgba = readonly [number, number, number, number];

/** A `width`×`height` RGBA image whose pixel (x, y) is `colourAt(x, y)`. */
function rgba(
  width: number,
  height: number,
  colourAt: (x: number, y: number) => Rgba,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(colourAt(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function pixelAt(image: RgbaImage, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(offset, offset + 4));
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

  it('never upscales, and keeps a size whose long edge is exactly the limit', () => {
    expect(fitWithin({ width: 320, height: 200 }, 1000)).toEqual({
      width: 320,
      height: 200,
      scale: 1,
    });
    expect(fitWithin({ width: 1000, height: 750 }, 1000)).toEqual({
      width: 1000,
      height: 750,
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

  it('gives the rounded mean of every block at an integer ratio, for any image', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.uint8Array({ minLength: 400, maxLength: 400 }),
        (factor, targetWidth, targetHeight, values) => {
          const width = targetWidth * factor;
          const height = targetHeight * factor;
          const image: GrayImage = {
            width,
            height,
            data: values.slice(0, width * height),
          };
          const shrunk = resizeGray(image, {
            width: targetWidth,
            height: targetHeight,
          });
          expect(Array.from(shrunk.data)).toEqual(blockMeans(image, factor));
        },
      ),
      { numRuns: 30 },
    );
  });

  it('weights partial source pixels when the ratio is fractional, along either axis', () => {
    // Each target pixel spans 1.5 source pixels: (0 + 90 / 2) / 1.5 and (90 / 2 + 180) / 1.5.
    expect(
      Array.from(
        resizeGray(gray(3, 1, [0, 90, 180]), { width: 2, height: 1 }).data,
      ),
    ).toEqual([30, 150]);
    expect(
      Array.from(
        resizeGray(gray(1, 3, [0, 90, 180]), { width: 1, height: 2 }).data,
      ),
    ).toEqual([30, 150]);
  });

  it('rounds the exact average half up', () => {
    expect(
      Array.from(resizeGray(gray(2, 1, [0, 1]), { width: 1, height: 1 }).data),
    ).toEqual([1]);
    expect(
      Array.from(
        resizeGray(gray(3, 1, [1, 1, 2]), { width: 1, height: 1 }).data,
      ),
    ).toEqual([1]);
  });

  it('blends the two nearest source pixels with centre-aligned weights when upscaling', () => {
    // Target centres sit at source 0, 0.25, 0.75, 1.25, 1.75 and 2 once clamped to the edges.
    const ramp = [0, 25, 75, 125, 175, 200];
    expect(
      Array.from(
        resizeGray(gray(3, 1, [0, 100, 200]), { width: 6, height: 1 }).data,
      ),
    ).toEqual(ramp);
    expect(
      Array.from(
        resizeGray(gray(1, 3, [0, 100, 200]), { width: 1, height: 6 }).data,
      ),
    ).toEqual(ramp);
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

  it('samples bilinearly, not by area, when one edge grows and the other shrinks', () => {
    // The single column's centre falls between the two middle pixels; the mean of the row would be 75.
    const mixed = resizeGray(gray(4, 1, [0, 100, 200, 0]), {
      width: 1,
      height: 2,
    });
    expect(Array.from(mixed.data)).toEqual([150, 150]);
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

  it('averages every 2×2 block per channel when shrinking in both directions', () => {
    const blocks: Rgba[] = [
      [10, 20, 30, 255],
      [40, 50, 60, 255],
      [70, 80, 90, 255],
      [100, 110, 120, 255],
    ];
    const image = rgba(
      4,
      4,
      (x, y) => blocks[Math.floor(y / 2) * 2 + Math.floor(x / 2)],
    );
    const shrunk = resizeRgba(image, { width: 2, height: 2 });
    expect(shrunk.data.length).toBe(16);
    expect(Array.from(shrunk.data)).toEqual(blocks.flat());
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
    expect(Array.from(up.data.filter((_, index) => index % 4 === 0))).toEqual([
      10, 20, 40, 50,
    ]);
  });

  it('interpolates each channel from its four neighbours when upscaling in both directions', () => {
    const corners: Rgba[] = [
      [0, 0, 0, 255],
      [80, 0, 0, 255],
      [0, 160, 0, 255],
      [80, 160, 240, 255],
    ];
    const image = rgba(2, 2, (x, y) => corners[y * 2 + x]);
    const up = resizeRgba(image, { width: 4, height: 4 });
    expect(up.data.length).toBe(64);
    expect(pixelAt(up, 0, 0)).toEqual(corners[0]);
    expect(pixelAt(up, 3, 0)).toEqual(corners[1]);
    expect(pixelAt(up, 0, 3)).toEqual(corners[2]);
    expect(pixelAt(up, 3, 3)).toEqual(corners[3]);
    // A quarter of the way in on both axes: red from the top row, green from the bottom, blue from the far corner only.
    expect(pixelAt(up, 1, 1)).toEqual([20, 40, 15, 255]);
    expect(pixelAt(up, 2, 2)).toEqual([60, 120, 135, 255]);
  });
});
