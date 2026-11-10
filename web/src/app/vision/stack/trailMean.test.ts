import { describe, expect, it } from 'vitest';

import { bandedFromRgba, rowOf } from '../image/banded';
import { emptySmearSum } from '../effects/smear';
import { trailMean } from './trailMean';
import type { RgbaImage } from '../types';

const SIZE = { width: 6, height: 2 };
const RECT = { x: 1, y: 0, width: 4, height: 2 };

function flat(value: number, size = RECT): RgbaImage {
  const data = new Uint8ClampedArray(size.width * size.height * 4);
  for (let pixel = 0; pixel < size.width * size.height; pixel += 1)
    data.set([value, value, value, 255], pixel * 4);
  return { width: size.width, height: size.height, data };
}

function input(amount: number) {
  const sum = emptySmearSum(SIZE);
  // Two frames: the mover (colour 200) covers working pixel (2, 0) in one of them fully, in the other not at all.
  sum.coverage[2] = 1;
  sum.colour.set([200, 200, 200], 2 * 3);
  return {
    background: bandedFromRgba(flat(50)),
    mean: bandedFromRgba(flat(120)),
    sum,
    frames: 2,
    rect: RECT,
    amount,
  };
}

const valuesOf = (image: ReturnType<typeof trailMean>, y: number) =>
  Array.from(rowOf(image, y)).filter((_, index) => index % 3 === 0);

describe('trailMean', () => {
  it('shows the background where no mover passed and the mover where one did, at full amount', () => {
    const result = trailMean(input(1));
    // Crop x 1 is working x 2: half covered, so half background (25) plus half the colour (100).
    expect(valuesOf(result, 0)).toEqual([50, 125, 50, 50]);
    expect(valuesOf(result, 1)).toEqual([50, 50, 50, 50]);
  });

  it('is the plain mean at amount 0', () => {
    expect(valuesOf(trailMean(input(0)), 0)).toEqual([120, 120, 120, 120]);
  });

  it('lies in between at half the amount', () => {
    expect(valuesOf(trailMean(input(0.5)), 0)).toEqual([85, 123, 85, 85]);
  });

  it('caps the coverage at one frame’s worth', () => {
    const crowded = input(1);
    crowded.sum.coverage[2] = 5;
    crowded.sum.colour.set([300, 300, 300], 2 * 3);
    expect(valuesOf(trailMean(crowded), 0)[1]).toBe(150);
  });
});
