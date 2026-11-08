import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

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
          for (const x of [10, 14, 15, 19]) {
            for (const channel of [0, 1, 2]) {
              const value = pixelOf(filled, x, 3)[channel];
              expect(value).toBeGreaterThanOrEqual(
                Math.min(a[channel], b[channel]),
              );
              expect(value).toBeLessThanOrEqual(
                Math.max(a[channel], b[channel]),
              );
            }
          }
        },
      ),
    );
  });

  it('works on a photo large enough for a coarse grid', () => {
    const image = solidImage(400, 300, [30, 60, 90]);
    const filled = fillHole(
      image,
      rectMask(400, 300, { x: 100, y: 80, width: 200, height: 140 }),
    );
    expect(pixelOf(filled, 200, 150)).toEqual([30, 60, 90, 255]);
  });
});
