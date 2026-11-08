import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  dilateMask,
  featherMask,
  growRect,
  maskBounds,
  maskCoverage,
  maskFromCategories,
} from './mask';
import { grayOf, rectMask } from './effects.test-support';

describe('maskFromCategories', () => {
  it('is 255 where the category is the person and 0 elsewhere', () => {
    const mask = maskFromCategories(
      Uint8Array.from([0, 15, 7, 15]),
      { width: 2, height: 2 },
      15,
    );
    expect(mask).toEqual({
      width: 2,
      height: 2,
      data: Uint8Array.from([0, 255, 0, 255]),
    });
  });

  it('refuses a category map of another size', () => {
    expect(() =>
      maskFromCategories(new Uint8Array(3), { width: 2, height: 2 }, 1),
    ).toThrow('3 categories for a 2 × 2 image.');
  });
});

describe('maskCoverage', () => {
  it('counts the pixels at 128 or more as inside', () => {
    expect(maskCoverage(grayOf(2, 2, [128, 127, 255, 0]))).toBe(0.5);
  });

  it('is 0 for an empty mask and 1 for a full one', () => {
    expect(maskCoverage(grayOf(2, 1, [0, 0]))).toBe(0);
    expect(maskCoverage(grayOf(2, 1, [255, 255]))).toBe(1);
  });
});

describe('dilateMask', () => {
  it('is a copy at radius 0', () => {
    const mask = rectMask(5, 5, { x: 1, y: 1, width: 2, height: 1 });
    expect(dilateMask(mask, 0)).toEqual(mask);
  });

  it('grows one pixel into a square of side 2·radius + 1', () => {
    const grown = dilateMask(
      rectMask(9, 9, { x: 4, y: 4, width: 1, height: 1 }),
      2,
    );
    expect(grown).toEqual(rectMask(9, 9, { x: 2, y: 2, width: 5, height: 5 }));
  });

  it('stops at the edge of the image', () => {
    const grown = dilateMask(
      rectMask(4, 4, { x: 0, y: 0, width: 1, height: 1 }),
      2,
    );
    expect(grown).toEqual(rectMask(4, 4, { x: 0, y: 0, width: 3, height: 3 }));
  });

  it('never loses a set pixel, and adds none beyond the radius', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 36, maxLength: 36 }),
        fc.integer({ min: 0, max: 3 }),
        (values, radius) => {
          const mask = { width: 6, height: 6, data: values };
          const grown = dilateMask(mask, radius).data;
          for (let i = 0; i < values.length; i += 1)
            expect(grown[i]).toBeGreaterThanOrEqual(values[i]);
          expect(Math.max(...grown)).toBe(Math.max(...values));
        },
      ),
    );
  });
});

describe('featherMask', () => {
  it('keeps a full mask full and an empty one empty', () => {
    expect(
      featherMask(
        rectMask(6, 6, { x: 0, y: 0, width: 6, height: 6 }),
        2,
      ).data.every((v) => v === 255),
    ).toBe(true);
    expect(
      featherMask(
        rectMask(6, 6, { x: 0, y: 0, width: 0, height: 0 }),
        2,
      ).data.every((v) => v === 0),
    ).toBe(true);
  });

  it('turns a hard edge into a ramp that rises across it', () => {
    const feathered = featherMask(
      rectMask(21, 1, { x: 10, y: 0, width: 11, height: 1 }),
      3,
    ).data;
    const ramp = Array.from(feathered.subarray(5, 16));
    expect(ramp).toEqual([...ramp].sort((a, b) => a - b));
    expect(feathered[10]).toBeGreaterThan(0);
    expect(feathered[10]).toBeLessThan(255);
    expect(feathered[0]).toBe(0);
    expect(feathered[20]).toBe(255);
  });
});

describe('maskBounds', () => {
  it('is null for an empty mask', () => {
    expect(maskBounds(grayOf(2, 2, [0, 0, 0, 0]), 5)).toBeNull();
  });

  it('is the rectangle around every non-zero pixel', () => {
    const mask = rectMask(10, 10, { x: 2, y: 3, width: 4, height: 2 });
    expect(maskBounds(mask, 0)).toEqual({ x: 2, y: 3, width: 4, height: 2 });
  });

  it('counts a faint pixel and spans separate people', () => {
    const mask = grayOf(5, 3, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9]);
    expect(maskBounds(mask, 0)).toEqual({ x: 0, y: 0, width: 5, height: 3 });
  });

  it('finds a single pixel in the first row and the first column', () => {
    const mask = rectMask(4, 4, { x: 0, y: 0, width: 1, height: 1 });
    expect(maskBounds(mask, 0)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('grows by the margin and stays inside the image', () => {
    const mask = rectMask(10, 10, { x: 1, y: 1, width: 2, height: 2 });
    expect(maskBounds(mask, 3)).toEqual({ x: 0, y: 0, width: 6, height: 6 });
  });
});

describe('growRect', () => {
  it('grows every side and clips to the image', () => {
    expect(
      growRect({ x: 5, y: 5, width: 2, height: 2 }, 2, {
        width: 20,
        height: 20,
      }),
    ).toEqual({
      x: 3,
      y: 3,
      width: 6,
      height: 6,
    });
    expect(
      growRect({ x: 1, y: 1, width: 8, height: 8 }, 5, {
        width: 10,
        height: 10,
      }),
    ).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
  });
});
