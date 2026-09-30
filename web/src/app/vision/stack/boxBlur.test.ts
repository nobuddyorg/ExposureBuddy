import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Size } from '../types';
import { boxBlurInPlace, savedRows } from './boxBlur';

/** A blurred copy of `data`, which stays as it was. */
function blurred(
  data: Float32Array,
  size: Size,
  radius: number,
  passes?: number,
): Float32Array {
  const layer = Float32Array.from(data);
  boxBlurInPlace(layer, size, radius, passes);
  return layer;
}

function impulse(
  width: number,
  height: number,
  x: number,
  y: number,
): Float32Array {
  const data = new Float32Array(width * height);
  data[y * width + x] = 1;
  return data;
}

function sum(data: Float32Array): number {
  let total = 0;
  for (const value of data) total += value;
  return total;
}

describe('boxBlurInPlace', () => {
  it('leaves the layer as it is at radius 0 or with no passes', () => {
    const data = impulse(5, 5, 2, 2);
    expect(blurred(data, { width: 5, height: 5 }, 0)).toEqual(data);
    expect(blurred(data, { width: 5, height: 5 }, 3, 0)).toEqual(data);
  });

  it('blurs the layer it is given, in place', () => {
    const layer = impulse(5, 5, 2, 2);
    boxBlurInPlace(layer, { width: 5, height: 5 }, 1, 1);
    expect(layer[0]).toBe(0);
    expect(layer[2 * 5 + 2]).toBeCloseTo(1 / 9, 6);
  });

  it('keeps a constant image constant, edges included, even with a radius past the image', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 3 }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (width, height, radius, passes, value) => {
          const flat = new Float32Array(width * height).fill(value);
          for (const sample of blurred(
            flat,
            { width, height },
            radius,
            passes,
          )) {
            expect(sample).toBeCloseTo(value, 3);
          }
        },
      ),
    );
  });

  it('spreads an impulse evenly over its window with one pass', () => {
    const spread = blurred(impulse(9, 9, 4, 4), { width: 9, height: 9 }, 1, 1);
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const inside = Math.abs(x - 4) <= 1 && Math.abs(y - 4) <= 1;
        expect(spread[y * 9 + x]).toBeCloseTo(inside ? 1 / 9 : 0, 6);
      }
    }
  });

  it('spreads an impulse symmetrically with three passes', () => {
    const size = 15;
    const center = 7;
    const spread = blurred(
      impulse(size, size, center, center),
      { width: size, height: size },
      2,
    );
    expect(spread[center * size + center]).toBeGreaterThan(
      spread[center * size + center + 1],
    );
    expect(spread[center * size + center + 1]).toBeGreaterThan(
      spread[center * size + center + 2],
    );
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const mirroredX = size - 1 - x;
        const mirroredY = size - 1 - y;
        expect(spread[y * size + x]).toBeCloseTo(
          spread[y * size + mirroredX],
          6,
        );
        expect(spread[y * size + x]).toBeCloseTo(
          spread[mirroredY * size + x],
          6,
        );
        expect(spread[y * size + x]).toBeCloseTo(spread[x * size + y], 6);
      }
    }
  });

  it('replicates the edge, so a corner impulse counts more than once in its window', () => {
    const spread = blurred(impulse(5, 5, 0, 0), { width: 5, height: 5 }, 1, 1);
    expect(spread[0]).toBeCloseTo(4 / 9, 6);
    expect(spread[1]).toBeCloseTo(2 / 9, 6);
    expect(spread[6]).toBeCloseTo(1 / 9, 6);
  });

  it('reads a row that left the window long ago from its saved copy, not from the blurred output', () => {
    // A tall column with an impulse at the top: every row is read again radius + 1 rows after it was overwritten.
    const height = 40;
    const spread = blurred(
      impulse(1, height, 0, 3),
      { width: 1, height },
      2,
      1,
    );
    for (let y = 0; y < height; y += 1) {
      expect(spread[y]).toBeCloseTo(Math.abs(y - 3) <= 2 ? 1 / 5 : 0, 6);
    }
  });

  it('preserves the total of a signal at least 3·radius from every edge, for one to three passes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 3 }),
        fc.array(fc.double({ min: -10, max: 10, noNaN: true }), {
          minLength: 9,
          maxLength: 9,
        }),
        (radius, passes, values) => {
          const margin = 3 * radius;
          const width = 3 + 2 * margin;
          const height = width;
          const data = new Float32Array(width * height);
          for (let index = 0; index < 9; index += 1) {
            const x = margin + (index % 3);
            const y = margin + Math.floor(index / 3);
            data[y * width + x] = values[index];
          }
          expect(
            sum(blurred(data, { width, height }, radius, passes)),
          ).toBeCloseTo(sum(data), 2);
        },
      ),
    );
  });
});

describe('savedRows', () => {
  it('keeps radius + 2 rows, never more than the image has', () => {
    expect(savedRows(3, 100)).toBe(5);
    expect(savedRows(128, 40)).toBe(40);
  });
});
