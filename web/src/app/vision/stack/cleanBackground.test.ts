import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { cleanMedian } from './cleanBackground';
import { selectMedian } from './stack';

function clean(
  samples: readonly number[],
  hiddenFlags: readonly number[],
  fallback = 7,
): number {
  return cleanMedian(
    {
      values: Uint8Array.from(samples),
      hidden: Uint8Array.from(hiddenFlags),
      count: samples.length,
      fallback,
    },
    new Uint8Array(samples.length),
  );
}

describe('cleanMedian', () => {
  it('leaves out the hidden passers-by, who are most of the frames here', () => {
    // Three of five frames see a person at 240; the two clear frames see the scene at 100 and 104.
    expect(clean([240, 100, 240, 104, 240], [1, 0, 1, 0, 1])).toBe(102);
  });

  it('takes the middle sample of an odd number of visible ones', () => {
    expect(clean([90, 10, 50, 200, 30], [0, 1, 0, 0, 1])).toBe(90);
  });

  it('averages the two middle samples of an even number of visible ones', () => {
    expect(clean([10, 20, 31, 99], [0, 0, 0, 1])).toBe(20);
    expect(clean([10, 21, 99], [0, 0, 1])).toBe(16);
  });

  it('falls back when every sample is hidden', () => {
    expect(clean([1, 2, 3], [1, 1, 1], 42)).toBe(42);
  });

  it('counts only the first `count` samples', () => {
    const result = cleanMedian(
      {
        values: Uint8Array.from([10, 20, 250, 250]),
        hidden: Uint8Array.from([0, 0, 0, 0]),
        count: 2,
        fallback: 0,
      },
      new Uint8Array(4),
    );
    expect(result).toBe(15);
  });

  it('does not change the input values', () => {
    const values = Uint8Array.from([9, 1, 8, 2]);
    cleanMedian(
      { values, hidden: new Uint8Array(4), count: 4, fallback: 0 },
      new Uint8Array(4),
    );
    expect([...values]).toEqual([9, 1, 8, 2]);
  });

  it('is the plain median when nothing is hidden', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (samples) => {
          const plain = selectMedian(Uint8Array.from(samples), samples.length);
          expect(
            clean(
              samples,
              samples.map(() => 0),
            ),
          ).toBe(plain);
        },
      ),
    );
  });

  it('is the plain median of the visible samples, whichever are hidden', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            value: fc.integer({ min: 0, max: 255 }),
            hidden: fc.integer({ min: 0, max: 1 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (samples) => {
          const visible = samples
            .filter((sample) => sample.hidden === 0)
            .map((sample) => sample.value);
          const expected =
            visible.length === 0
              ? 7
              : selectMedian(Uint8Array.from(visible), visible.length);
          const actual = clean(
            samples.map((sample) => sample.value),
            samples.map((sample) => sample.hidden),
          );
          expect(actual).toBe(expected);
        },
      ),
    );
  });
});
