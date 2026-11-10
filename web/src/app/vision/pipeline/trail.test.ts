import { describe, expect, it } from 'vitest';

import { emptySmearSum } from '../effects/smear';
import { addTrailFrame } from './trail';
import { trackAreas } from './trackAreas';
import type { GrayImage, RgbaImage } from '../types';

const WORKING = { width: 400, height: 200 };
const MASK = { width: 200, height: 100 };

function box(x: number, y: number, size = 12): GrayImage {
  const data = new Uint8Array(MASK.width * MASK.height);
  for (let dy = 0; dy < size; dy += 1)
    for (let dx = 0; dx < size; dx += 1)
      data[(y + dy) * MASK.width + x + dx] = 255;
  return { ...MASK, data };
}

const nothing: GrayImage = {
  ...MASK,
  data: new Uint8Array(MASK.width * MASK.height),
};

function frame(red: number): RgbaImage {
  const data = new Uint8ClampedArray(WORKING.width * WORKING.height * 4);
  for (let pixel = 0; pixel < WORKING.width * WORKING.height; pixel += 1)
    data.set([red, 0, 0, 255], pixel * 4);
  return { ...WORKING, data };
}

const covered = (coverage: Float32Array, y: number) =>
  Array.from(coverage.slice(y * WORKING.width, (y + 1) * WORKING.width))
    .map((value, x) => (value > 0.01 ? x : -1))
    .filter((x) => x >= 0);

describe('addTrailFrame', () => {
  it('draws a mover as a streak up to where it is in the next sample', () => {
    const [first] = trackAreas([box(20, 40), box(60, 40)]);
    const sum = emptySmearSum(WORKING);
    addTrailFrame(
      sum,
      { image: frame(200), moving: first, standing: nothing },
      { standingBlur: 0 },
    );
    const row = covered(sum.coverage, 92);
    // The box starts at working x 40 and moves 80 working pixels on.
    expect(row[0]).toBeLessThanOrEqual(42);
    expect(row[row.length - 1]).toBeGreaterThanOrEqual(125);
    expect(row.length).toBeGreaterThan(80);
  });

  it('draws the last sample’s mover back along the way it came', () => {
    const [, last] = trackAreas([box(20, 40), box(60, 40)]);
    const sum = emptySmearSum(WORKING);
    addTrailFrame(
      sum,
      { image: frame(200), moving: last, standing: nothing },
      { standingBlur: 0 },
    );
    const row = covered(sum.coverage, 92);
    expect(row[0]).toBeLessThanOrEqual(42);
    expect(row[row.length - 1]).toBeGreaterThanOrEqual(125);
  });

  it('leaves people who stand about alone unless asked to blur them', () => {
    const sum = emptySmearSum(WORKING);
    addTrailFrame(
      sum,
      { image: frame(200), moving: [], standing: box(60, 40) },
      { standingBlur: 0 },
    );
    expect(sum.coverage.every((value) => value === 0)).toBe(true);
  });

  it('blurs people who stand about, sideways around where they are', () => {
    const sum = emptySmearSum(WORKING);
    addTrailFrame(
      sum,
      { image: frame(200), moving: [], standing: box(60, 40) },
      { standingBlur: 0.05 },
    );
    const row = covered(sum.coverage, 92);
    // 5 % of 400 px is 20 px, ten each way around the box at working x 120 to 144.
    expect(row[0]).toBeLessThan(115);
    expect(row[row.length - 1]).toBeGreaterThan(148);
  });

  it('blurs a mover that stood still as well, and skips specks among those who stand', () => {
    const [first] = trackAreas([box(60, 40), box(60, 40)]);
    const sum = emptySmearSum(WORKING);
    addTrailFrame(
      sum,
      { image: frame(200), moving: first, standing: box(150, 10, 3) },
      { standingBlur: 0.05 },
    );
    expect(covered(sum.coverage, 92).length).toBeGreaterThan(24);
    expect(covered(sum.coverage, 25)).toEqual([]);
  });

  it('keeps a still mover as it is when standing people are left alone', () => {
    const [first] = trackAreas([box(60, 40), box(60, 40)]);
    const sum = emptySmearSum(WORKING);
    addTrailFrame(
      sum,
      { image: frame(200), moving: first, standing: nothing },
      { standingBlur: 0 },
    );
    expect(sum.coverage.every((value) => value === 0)).toBe(true);
  });
});
