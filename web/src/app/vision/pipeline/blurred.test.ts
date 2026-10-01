import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { BLURRED_SHARPNESS_RATIO, blurredFrames } from './blurred';

const burst = (values: number[]) =>
  new Map(values.map((value, index) => [index, value]));

describe('blurredFrames', () => {
  it('names the frames well below the median, in burst order', () => {
    expect(blurredFrames(burst([40, 9, 38, 42, 18, 41]), 2)).toEqual([1, 4]);
  });

  it('keeps a frame at exactly the share of the median', () => {
    expect(blurredFrames(burst([40, 28, 40]), 0)).toEqual([]);
    expect(blurredFrames(burst([40, 27.99, 40]), 0)).toEqual([1]);
  });

  it('never names the reference, however blurred', () => {
    expect(blurredFrames(burst([40, 3, 41, 39]), 1)).toEqual([]);
  });

  it('judges by the lower median of an even burst', () => {
    // Lower median 10, so nothing is below 7; the upper median, 30, would take both tens.
    expect(blurredFrames(burst([10, 30, 10, 30]), 3)).toEqual([]);
  });

  it('sorts by value, not by digits', () => {
    // Sorted as text, 7.5 would come after 11 and the lower median would be 11 instead of 9.
    expect(blurredFrames(burst([10, 9, 11, 7.5]), 0)).toEqual([]);
  });

  it('names nothing in an empty burst or one of two', () => {
    expect(blurredFrames(new Map(), 0)).toEqual([]);
    expect(blurredFrames(burst([100, 1]), 0)).toEqual([]);
  });

  it('always keeps the reference and at least half the burst', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), {
          minLength: 1,
          maxLength: 40,
        }),
        fc.nat(),
        (values, pick) => {
          const reference = pick % values.length;
          const blurred = blurredFrames(burst(values), reference);
          expect(blurred).not.toContain(reference);
          expect(values.length - blurred.length).toBeGreaterThanOrEqual(
            Math.ceil(values.length / 2),
          );
          const sorted = [...values].sort((a, b) => a - b);
          const threshold =
            BLURRED_SHARPNESS_RATIO *
            sorted[Math.floor((values.length - 1) / 2)];
          blurred.forEach((index) =>
            expect(values[index]).toBeLessThan(threshold),
          );
        },
      ),
    );
  });
});
