import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { boxBlurFloat } from './boxBlur';

function impulse(width: number, height: number, x: number, y: number): Float32Array {
  const data = new Float32Array(width * height);
  data[y * width + x] = 1;
  return data;
}

function sum(data: Float32Array): number {
  let total = 0;
  for (const value of data) total += value;
  return total;
}

describe('boxBlurFloat', () => {
  it('returns an independent copy at radius 0 or with no passes', () => {
    const data = impulse(5, 5, 2, 2);
    for (const copy of [
      boxBlurFloat(data, { width: 5, height: 5 }, 1, 0),
      boxBlurFloat(data, { width: 5, height: 5 }, 1, 3, 0),
    ]) {
      expect(copy).toEqual(data);
      expect(copy).not.toBe(data);
    }
  });

  it('keeps a constant image constant in every channel, edges included', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 3 }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (width, height, channels, radius, passes, value) => {
          const flat = new Float32Array(width * height * channels).fill(value);
          const blurred = boxBlurFloat(
            flat,
            { width, height },
            channels,
            radius,
            passes,
          );
          for (const sample of blurred) {
            expect(sample).toBeCloseTo(value, 3);
          }
        },
      ),
    );
  });

  it('spreads an impulse evenly over its window with one pass', () => {
    const blurred = boxBlurFloat(impulse(9, 9, 4, 4), { width: 9, height: 9 }, 1, 1, 1);
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const inside = Math.abs(x - 4) <= 1 && Math.abs(y - 4) <= 1;
        expect(blurred[y * 9 + x]).toBeCloseTo(inside ? 1 / 9 : 0, 6);
      }
    }
  });

  it('spreads an impulse symmetrically with three passes', () => {
    const size = 15;
    const center = 7;
    const blurred = boxBlurFloat(impulse(size, size, center, center), { width: size, height: size }, 1, 2);
    expect(blurred[center * size + center]).toBeGreaterThan(blurred[center * size + center + 1]);
    expect(blurred[center * size + center + 1]).toBeGreaterThan(blurred[center * size + center + 2]);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const mirroredX = size - 1 - x;
        const mirroredY = size - 1 - y;
        expect(blurred[y * size + x]).toBeCloseTo(blurred[y * size + mirroredX], 6);
        expect(blurred[y * size + x]).toBeCloseTo(blurred[mirroredY * size + x], 6);
        expect(blurred[y * size + x]).toBeCloseTo(blurred[x * size + y], 6);
      }
    }
  });

  it('replicates the edge, so a corner impulse counts more than once in its window', () => {
    const blurred = boxBlurFloat(impulse(5, 5, 0, 0), { width: 5, height: 5 }, 1, 1, 1);
    expect(blurred[0]).toBeCloseTo(4 / 9, 6);
    expect(blurred[1]).toBeCloseTo(2 / 9, 6);
    expect(blurred[6]).toBeCloseTo(1 / 9, 6);
  });

  it('blurs each interleaved channel on its own', () => {
    const data = new Float32Array(3 * 3 * 2);
    data[(1 * 3 + 1) * 2] = 9;
    const blurred = boxBlurFloat(data, { width: 3, height: 3 }, 2, 1, 1);
    for (let pixel = 0; pixel < 9; pixel += 1) {
      expect(blurred[pixel * 2]).toBeCloseTo(1, 6);
      expect(blurred[pixel * 2 + 1]).toBe(0);
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
          const blurred = boxBlurFloat(data, { width, height }, 1, radius, passes);
          expect(sum(blurred)).toBeCloseTo(sum(data), 3);
        },
      ),
    );
  });

  it('does not touch its input', () => {
    const data = impulse(5, 5, 2, 2);
    const before = new Float32Array(data);
    boxBlurFloat(data, { width: 5, height: 5 }, 1, 2);
    expect(data).toEqual(before);
  });
});
