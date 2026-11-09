import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { seededRandom } from '../golden.test-support';
import type { RgbaImage } from '../types';
import { fillHole } from './inpaint';
import {
  grayOf,
  pixelOf,
  rectMask,
  solidImage,
  withRect,
} from './effects.test-support';

describe('fillHole', () => {
  it('fills a hole in a flat scene with that scene', () => {
    const image = withRect(
      solidImage(40, 30, [60, 120, 180]),
      { x: 15, y: 10, width: 10, height: 10 },
      [255, 0, 0],
    );
    const filled = fillHole(
      image,
      rectMask(40, 30, { x: 15, y: 10, width: 10, height: 10 }),
    );
    expect(pixelOf(filled, 20, 15)).toEqual([60, 120, 180, 255]);
    expect(pixelOf(filled, 15, 10)).toEqual([60, 120, 180, 255]);
  });

  it('leaves every pixel outside the hole as it was', () => {
    const image = withRect(
      solidImage(40, 30, [60, 120, 180]),
      { x: 0, y: 0, width: 5, height: 5 },
      [1, 2, 3],
    );
    const filled = fillHole(
      image,
      rectMask(40, 30, { x: 15, y: 10, width: 10, height: 10 }),
    );
    expect(pixelOf(filled, 2, 2)).toEqual([1, 2, 3, 255]);
    expect(pixelOf(filled, 39, 29)).toEqual([60, 120, 180, 255]);
  });

  it('blends the two sides of the hole across it, left to right', () => {
    const left = withRect(
      solidImage(60, 10, [200, 200, 200]),
      { x: 0, y: 0, width: 30, height: 10 },
      [0, 0, 0],
    );
    const filled = fillHole(
      left,
      rectMask(60, 10, { x: 20, y: 0, width: 20, height: 10 }),
    );
    const across = [21, 25, 30, 35, 38].map((x) => pixelOf(filled, x, 5)[0]);
    expect(across).toEqual([...across].sort((a, b) => a - b));
    expect(across[0]).toBeLessThan(across[4]);
    expect(across[0]).toBeGreaterThanOrEqual(0);
    expect(across[4]).toBeLessThanOrEqual(200);
  });

  it('settles the fill into a smooth ramp across the hole, with no step between neighbours', () => {
    const image = withRect(
      solidImage(100, 10, [0, 0, 0]),
      { x: 70, y: 0, width: 30, height: 10 },
      [200, 200, 200],
    );
    const filled = fillHole(
      image,
      rectMask(100, 10, { x: 30, y: 0, width: 40, height: 10 }),
    );
    const row = Array.from(
      { length: 42 },
      (_, i) => pixelOf(filled, 29 + i, 5)[0],
    );
    const steps = row.slice(1).map((value, i) => value - row[i]);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...steps)).toBeLessThan(12);
    expect(row[0]).toBe(0);
    expect(row[41]).toBe(200);
  });

  it('fills a hole that reaches the corner of the image', () => {
    const image = solidImage(30, 30, [90, 90, 90]);
    const filled = fillHole(
      image,
      rectMask(30, 30, { x: 0, y: 0, width: 20, height: 20 }),
    );
    expect(pixelOf(filled, 0, 0)).toEqual([90, 90, 90, 255]);
    expect(pixelOf(filled, 19, 19)).toEqual([90, 90, 90, 255]);
  });

  it('returns a copy when the hole has nothing around it to spread', () => {
    const image = solidImage(4, 4, [5, 6, 7]);
    const everywhere = rectMask(4, 4, { x: 0, y: 0, width: 4, height: 4 });
    const filled = fillHole(image, everywhere);
    expect(filled).toEqual(image);
    expect(filled.data).not.toBe(image.data);
  });

  it('changes nothing when there is no hole', () => {
    const image = withRect(
      solidImage(8, 8, [1, 2, 3]),
      { x: 2, y: 2, width: 2, height: 2 },
      [9, 9, 9],
    );
    expect(fillHole(image, grayOf(8, 8, new Array(64).fill(0)))).toEqual(image);
  });

  it('only ever invents colours that lie between the ones around the hole', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: 3,
          maxLength: 3,
        }),
        fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: 3,
          maxLength: 3,
        }),
        (a, b) => {
          const half = withRect(
            solidImage(30, 6, [a[0], a[1], a[2]]),
            { x: 15, y: 0, width: 15, height: 6 },
            [b[0], b[1], b[2]],
          );
          const filled = fillHole(
            half,
            rectMask(30, 6, { x: 10, y: 0, width: 10, height: 6 }),
          );
          const outside = [10, 14, 15, 19].flatMap((x) =>
            [0, 1, 2].filter((channel) => {
              const value = pixelOf(filled, x, 3)[channel];
              return (
                value < Math.min(a[channel], b[channel]) ||
                value > Math.max(a[channel], b[channel])
              );
            }),
          );
          expect(outside).toEqual([]);
        },
      ),
      // Each run fills a hole; a few dozen cover the property, and the mutation run is slow enough already.
      { numRuns: 12 },
    );
  });

  it('works on a photo large enough for a coarse grid', () => {
    const image = solidImage(321, 201, [30, 60, 90]);
    const filled = fillHole(
      image,
      rectMask(321, 201, { x: 130, y: 80, width: 60, height: 40 }),
    );
    expect(pixelOf(filled, 160, 100)).toEqual([30, 60, 90, 255]);
  });
});

// A photo larger than the colour grid (321 × 201 puts three pixels in a cell), with a steep known colour field:
// red climbs 2 levels per pixel across each 120 px, green 3 per pixel down each 75 px. Holes sit on cell centres,
// where the cell colours reproduce the field exactly, so any slip in the grid mapping shows as whole levels.
const FIELD_WIDTH = 321;
const FIELD_HEIGHT = 201;

function field(): RgbaImage {
  const width = FIELD_WIDTH;
  const height = FIELD_HEIGHT;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      data.set([(x % 120) * 2, (y % 75) * 3, 128, 255], (y * width + x) * 4);
  return { width, height, data };
}

function holeAt(points: readonly [number, number][], value = 255) {
  const data = new Uint8Array(FIELD_WIDTH * FIELD_HEIGHT);
  for (const [x, y] of points) data[y * FIELD_WIDTH + x] = value;
  return { width: FIELD_WIDTH, height: FIELD_HEIGHT, data };
}

describe('fillHole on a photo larger than the grid', () => {
  it('reproduces the colour field at the centre of a cell, mid-photo and in every corner', () => {
    const image = field();
    const points: [number, number][] = [
      [31, 31],
      [100, 40],
      [220, 130],
      [1, 1],
      [319, 1],
      [1, 199],
      [319, 199],
    ];
    const filled = fillHole(image, holeAt(points));
    for (const [x, y] of points) {
      const [r, g] = pixelOf(filled, x, y);
      expect(r).toBeCloseTo((x % 120) * 2, 0);
      expect(g).toBeCloseTo((y % 75) * 3, 0);
    }
  });

  it('holds the last cell colour past the last cell centre, instead of reaching beyond the grid', () => {
    const filled = fillHole(field(), holeAt([[320, 200]]));
    // The last cell is 318–320 by 198–200; the fill is the mean of its eight known pixels, (1422 − 160) / 8 and (1323 − 150) / 8.
    const [r, g] = pixelOf(filled, 320, 200);
    expect(r).toBeCloseTo(157.75, 0);
    expect(g).toBeCloseTo(146.625, 0);
  });

  it('counts a mask value of 128 as the hole and 127 as the photo', () => {
    const image = field();
    const marked = {
      ...image,
      data: Uint8ClampedArray.from(image.data),
    };
    marked.data.set([255, 255, 255, 255], (31 * FIELD_WIDTH + 31) * 4);
    marked.data.set([255, 255, 255, 255], (31 * FIELD_WIDTH + 35) * 4);
    const mask = holeAt([[31, 31]], 128);
    mask.data[31 * FIELD_WIDTH + 35] = 127;
    const filled = fillHole(marked, mask);
    expect(pixelOf(filled, 31, 31).slice(0, 2)).toEqual([62, 93]);
    expect(pixelOf(filled, 35, 31)).toEqual([255, 255, 255, 255]);
  });

  it('leaves every pixel outside the hole exactly as it was, even in a busy photo', () => {
    const random = seededRandom(3);
    const busy = {
      width: 200,
      height: 120,
      data: Uint8ClampedArray.from({ length: 200 * 120 * 4 }, (_, i) =>
        i % 4 === 3 ? 255 : Math.floor(random() * 256),
      ),
    };
    const mask = rectMask(200, 120, { x: 80, y: 30, width: 50, height: 40 });
    const filled = fillHole(busy, mask);
    const changedOutside: number[] = [];
    for (let y = 0; y < 120; y += 1)
      for (let x = 0; x < 200; x += 1) {
        if (x >= 80 && x < 130 && y >= 30 && y < 70) continue;
        const at = (y * 200 + x) * 4;
        for (let channel = 0; channel < 3; channel += 1)
          if (filled.data[at + channel] !== busy.data[at + channel])
            changedOutside.push(at + channel);
      }
    expect(changedOutside).toEqual([]);
  });
});

describe('fillHole at the edges of the grid', () => {
  it('fills a hole across the whole top of the photo from what lies below it', () => {
    const image = withRect(
      solidImage(30, 30, [0, 200, 0]),
      { x: 0, y: 10, width: 30, height: 20 },
      [200, 0, 0],
    );
    const filled = fillHole(
      image,
      rectMask(30, 30, { x: 0, y: 0, width: 30, height: 10 }),
    );
    expect(pixelOf(filled, 15, 0)).toEqual([200, 0, 0, 255]);
  });

  it('does not borrow colour from the far side of the photo for a hole on the right edge', () => {
    const left = withRect(
      solidImage(30, 10, [200, 0, 0]),
      { x: 0, y: 0, width: 5, height: 10 },
      [0, 200, 0],
    );
    const filled = fillHole(
      left,
      rectMask(30, 10, { x: 20, y: 0, width: 10, height: 10 }),
    );
    const [r, g] = pixelOf(filled, 29, 5);
    expect(r).toBeGreaterThanOrEqual(190);
    expect(g).toBeLessThanOrEqual(10);
  });

  it('settles across a wide hole to a known profile', () => {
    const image = withRect(
      solidImage(100, 10, [0, 0, 0]),
      { x: 70, y: 0, width: 30, height: 10 },
      [200, 200, 200],
    );
    const filled = fillHole(
      image,
      rectMask(100, 10, { x: 30, y: 0, width: 40, height: 10 }),
    );
    expect(
      [35, 40, 45, 50, 55, 60, 65].map((x) => pixelOf(filled, x, 5)[0]),
    ).toEqual([10, 29, 62, 104, 146, 176, 192]);
  });
});
