import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { spreadOut } from './blurFrames';

describe('spreadOut', () => {
  it('keeps every key when there are not more than the limit', () => {
    expect(spreadOut([1, 2, 3], 3)).toEqual([1, 2, 3]);
    expect(spreadOut([1, 2], 6)).toEqual([1, 2]);
    expect(spreadOut([], 4)).toEqual([]);
  });

  it('takes the first and the last and the ones between at even steps', () => {
    expect(spreadOut([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([0, 3, 6, 9]);
    expect(spreadOut([0, 1, 2, 3, 4], 3)).toEqual([0, 2, 4]);
  });

  it('takes just the first when the limit is below two', () => {
    expect(spreadOut([5, 6, 7], 1)).toEqual([5]);
    expect(spreadOut([5, 6, 7], 0)).toEqual([5]);
  });

  it('gives exactly `limit` keys, in order, with both ends, for any longer list', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 40 }),
        fc.integer({ min: 2, max: 40 }),
        (count, limit) => {
          fc.pre(count > limit);
          const keys = Array.from({ length: count }, (_, index) => index);
          const picked = spreadOut(keys, limit);
          expect(picked).toHaveLength(limit);
          expect(picked[0]).toBe(0);
          expect(picked[limit - 1]).toBe(count - 1);
          expect(picked).toEqual([...picked].sort((a, b) => a - b));
          expect(new Set(picked).size).toBe(limit);
        },
      ),
    );
  });
});
