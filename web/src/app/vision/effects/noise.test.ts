import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { fractalNoise, valueNoise } from './noise';

const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });

describe('valueNoise', () => {
  it('stays within 0 and 1 for any point and seed', () => {
    fc.assert(
      fc.property(
        coordinate,
        coordinate,
        fc.integer({ min: 0, max: 99 }),
        (x, y, seed) => {
          const value = valueNoise(x, y, seed);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it('answers the same for the same point and seed', () => {
    expect(valueNoise(3.7, -2.2, 5)).toBe(valueNoise(3.7, -2.2, 5));
  });

  it('differs between seeds and between lattice points', () => {
    expect(valueNoise(3, 4, 1)).not.toBe(valueNoise(3, 4, 2));
    expect(valueNoise(3, 4, 1)).not.toBe(valueNoise(4, 4, 1));
    expect(valueNoise(3, 4, 1)).not.toBe(valueNoise(3, 5, 1));
  });

  it('has no jumps: a small step moves the value only a little', () => {
    fc.assert(
      fc.property(coordinate, coordinate, (x, y) => {
        expect(
          Math.abs(valueNoise(x + 0.01, y, 3) - valueNoise(x, y, 3)),
        ).toBeLessThan(0.05);
        expect(
          Math.abs(valueNoise(x, y + 0.01, 3) - valueNoise(x, y, 3)),
        ).toBeLessThan(0.05);
      }),
    );
  });

  it('reaches the lattice values exactly on the lattice', () => {
    expect(valueNoise(2, 3, 7)).toBe(valueNoise(2, 3, 7));
    const between = valueNoise(2.5, 3, 7);
    const [a, b] = [valueNoise(2, 3, 7), valueNoise(3, 3, 7)];
    expect(between).toBeCloseTo((a + b) / 2, 10);
  });
});

describe('fractalNoise', () => {
  it('stays within 0 and 1 and is repeatable', () => {
    fc.assert(
      fc.property(coordinate, coordinate, (x, y) => {
        const value = fractalNoise(x, y, 1);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        expect(fractalNoise(x, y, 1)).toBe(value);
      }),
    );
  });

  it('mixes three octaves of value noise with weights 4, 2 and 1', () => {
    const [x, y] = [1.3, 2.9];
    const expected =
      (valueNoise(x, y, 5) * 4 +
        valueNoise(x * 2, y * 2, 6) * 2 +
        valueNoise(x * 4, y * 4, 7)) /
      7;
    expect(fractalNoise(x, y, 5)).toBeCloseTo(expected, 12);
  });
});
