import { describe, expect, it } from 'vitest';

import { indices } from './indices';

describe('indices', () => {
  it('counts from zero below the count', () => {
    expect(indices(4)).toEqual([0, 1, 2, 3]);
    expect(indices(0)).toEqual([]);
  });

  it('steps, and stops before the count whether or not the step divides it', () => {
    expect(indices(8, 4)).toEqual([0, 4]);
    expect(indices(9, 4)).toEqual([0, 4, 8]);
    expect(indices(1, 4)).toEqual([0]);
  });
});
