import { describe, expect, it } from 'vitest';

import { grayOf } from '../effects/effects.test-support';
import { areasOf } from './areas';

const sorted = (areas: number[][]) =>
  areas.map((area) => [...area].sort((a, b) => a - b));

describe('areasOf', () => {
  it('finds no areas in an empty mask', () => {
    expect(areasOf(grayOf(3, 2, [0, 0, 0, 0, 0, 0]))).toEqual([]);
  });

  it('counts a pixel from half on as set, and one just below as clear', () => {
    expect(areasOf(grayOf(3, 1, [128, 0, 127]))).toEqual([[0]]);
  });

  it('joins a neighbour at exactly half to the area', () => {
    expect(sorted(areasOf(grayOf(3, 1, [255, 128, 0])))).toEqual([[0, 1]]);
  });

  it('gives every set pixel to exactly one area', () => {
    const areas = areasOf(grayOf(3, 2, [255, 255, 0, 0, 255, 0]));
    expect(sorted(areas)).toEqual([[0, 1, 4]]);
  });

  it('follows an area leftwards from where it starts', () => {
    // Row-major, the area starts top right; the bottom row is reached only by going left.
    const mask = grayOf(3, 2, [0, 0, 255, 255, 255, 255]);
    expect(sorted(areasOf(mask))).toEqual([[2, 3, 4, 5]]);
  });

  it('follows an area upwards from where it starts', () => {
    // A U: the right arm's top is reached only by going up from the bottom row.
    const mask = grayOf(3, 2, [255, 0, 255, 255, 255, 255]);
    expect(sorted(areasOf(mask))).toEqual([[0, 2, 3, 4, 5]]);
  });

  it('keeps areas that touch only at a corner apart', () => {
    const mask = grayOf(2, 2, [255, 0, 0, 255]);
    expect(sorted(areasOf(mask))).toEqual([[0], [3]]);
  });
});
