import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ROBUST_MODE_COUNT, robustBackgrounds } from './backgrounds';
import { selectMedian } from './stack';

function estimate(samples: readonly number[]): {
  trimmed: number;
  clipped: number;
  densest: number;
} {
  const values = Uint8Array.from(samples);
  const median = selectMedian(Uint8Array.from(samples), samples.length);
  const estimates = new Uint8Array(ROBUST_MODE_COUNT);
  robustBackgrounds(
    { values, count: samples.length, median },
    new Uint8Array(samples.length),
    estimates,
  );
  return {
    trimmed: estimates[0],
    clipped: estimates[1],
    densest: estimates[2],
  };
}

const repeat = (value: number, times: number): number[] =>
  Array.from({ length: times }, () => value);

describe('robustBackgrounds', () => {
  it('returns the constant for a constant stack, in every mode', () => {
    expect(estimate(repeat(77, 9))).toEqual({
      trimmed: 77,
      clipped: 77,
      densest: 77,
    });
  });

  it('keeps a minority mover out of the clipped mean and the densest window, but not out of the trimmed mean', () => {
    // Seven frames see the scene at 100, three see a passer-by at 240.
    const { trimmed, clipped, densest } = estimate([
      ...repeat(100, 7),
      ...repeat(240, 3),
    ]);
    expect(clipped).toBe(100);
    expect(densest).toBe(100);
    expect(trimmed).toBe(Math.round((5 * 100 + 240) / 6));
  });

  it('picks the scene over a crowd whose clothes all differ, where the median lands on the crowd', () => {
    const samples = [...repeat(100, 4), 150, 170, 190, 210, 230, 250];
    expect(selectMedian(Uint8Array.from(samples), samples.length)).toBe(160);
    expect(estimate(samples).densest).toBe(100);
  });

  it('finds the scene in the bright cluster, wherever the sorted window sits', () => {
    expect(
      estimate([200, 50, 200, 120, 200, 200, 120, 200, 200, 50]).densest,
    ).toBe(200);
  });

  it('lets a later, larger window beat an earlier one', () => {
    expect(
      estimate([120, 0, 200, 40, 200, 120, 80, 200, 120, 200]).densest,
    ).toBe(200);
  });

  it('accepts a spread of exactly 32 levels in one window and splits at 33', () => {
    expect(estimate([132, 100, 116]).densest).toBe(116);
    expect(estimate([116, 133, 100]).densest).toBe(108);
  });

  it('keeps the darker window when two are equally dense', () => {
    expect(estimate([200, 50, 200, 50]).densest).toBe(50);
  });

  it('keeps a sample 8 levels from the median and drops one 9 away when the samples barely vary', () => {
    expect(estimate([100, 108, 100, 100, 100, 109, 100]).clipped).toBe(101);
  });

  it('scales the clip limit with the spread of the samples', () => {
    // MAD 10 → limit 44: the 130 stays in; a limit of 20 would drop it.
    expect(estimate([110, 90, 130, 100, 110, 100, 90, 110, 100]).clipped).toBe(
      104,
    );
  });

  it('averages the middle half for the trimmed mean', () => {
    expect(estimate([0, 10, 20, 30, 40, 50, 60, 255]).trimmed).toBe(35);
  });

  it('drops no samples of a three-frame stack from the trimmed mean', () => {
    expect(estimate([10, 20, 60]).trimmed).toBe(30);
  });

  it('keeps every estimate inside the range of the samples', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: 1,
          maxLength: 40,
        }),
        (samples) => {
          const low = Math.min(...samples);
          const high = Math.max(...samples);
          for (const value of Object.values(estimate(samples))) {
            expect(value).toBeGreaterThanOrEqual(low);
            expect(value).toBeLessThanOrEqual(high);
          }
        },
      ),
    );
  });
});
