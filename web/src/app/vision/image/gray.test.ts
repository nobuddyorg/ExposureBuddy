import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { RgbaImage } from '../types';
import { rgbaToGray } from './gray';

function rgbaOf(pixels: readonly (readonly number[])[]): RgbaImage {
  return {
    width: pixels.length,
    height: 1,
    data: new Uint8ClampedArray(pixels.flat()),
  };
}

describe('rgbaToGray', () => {
  it('weights the channels by Rec. 601 and rounds to nearest', () => {
    const gray = rgbaToGray(
      rgbaOf([
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        [0, 0, 255, 255],
        [255, 255, 255, 255],
        [0, 0, 0, 255],
        [100, 100, 100, 255],
        [10, 20, 30, 255],
      ]),
    );
    expect(Array.from(gray.data)).toEqual([76, 150, 29, 255, 0, 100, 18]);
    expect(gray.width).toBe(7);
    expect(gray.height).toBe(1);
  });

  it('ignores alpha', () => {
    const opaque = rgbaToGray(rgbaOf([[90, 120, 200, 255]]));
    const transparent = rgbaToGray(rgbaOf([[90, 120, 200, 0]]));
    expect(transparent.data[0]).toBe(opaque.data[0]);
  });

  it('keeps every neutral pixel at its own value and never leaves 0–255', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: 1,
          maxLength: 32,
        }),
        (values) => {
          const gray = rgbaToGray(rgbaOf(values.map((v) => [v, v, v, 255])));
          expect(Array.from(gray.data)).toEqual(values);
        },
      ),
    );
  });

  it('lies between the darkest and brightest channel of each pixel', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
        ),
        ([r, g, b]) => {
          const value = rgbaToGray(rgbaOf([[r, g, b, 255]])).data[0];
          expect(value).toBeGreaterThanOrEqual(Math.min(r, g, b));
          expect(value).toBeLessThanOrEqual(Math.max(r, g, b));
        },
      ),
    );
  });
});
