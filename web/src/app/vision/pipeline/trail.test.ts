import { describe, expect, it } from 'vitest';

import { emptySmearSum } from '../effects/smear';
import { addTrailFrame } from './trail';
import { MIN_TRACKED_AREA, trackAreas, type TrackedArea } from './trackAreas';
import type { GrayImage, RgbaImage } from '../types';

const WORKING = { width: 400, height: 200 };
const MASK = { width: 200, height: 100 };

function box(x: number, y: number, size = 12, height = size): GrayImage {
  const data = new Uint8Array(MASK.width * MASK.height);
  for (let dy = 0; dy < height; dy += 1)
    for (let dx = 0; dx < size; dx += 1)
      data[(y + dy) * MASK.width + x + dx] = 255;
  return { ...MASK, data };
}

const nothing: GrayImage = {
  ...MASK,
  data: new Uint8Array(MASK.width * MASK.height),
};

function frame(red: number, size = WORKING): RgbaImage {
  const data = new Uint8ClampedArray(size.width * size.height * 4);
  for (let pixel = 0; pixel < size.width * size.height; pixel += 1)
    data.set([red, 0, 0, 255], pixel * 4);
  return { ...size, data };
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
    expect(row[0]).toBeLessThanOrEqual(110);
    expect(row[row.length - 1]).toBeGreaterThanOrEqual(154);
  });

  it('blurs people who stand about when their area is exactly the smallest tracked size', () => {
    const sum = emptySmearSum(WORKING);
    addTrailFrame(
      sum,
      {
        image: frame(200),
        moving: [],
        standing: box(60, 40, 5, MIN_TRACKED_AREA / 5),
      },
      { standingBlur: 0.05 },
    );
    expect(sum.coverage.some((value) => value > 0)).toBe(true);
  });

  it('blurs a mover that stood still as well, and skips specks among those who stand', () => {
    const [first] = trackAreas([box(60, 40), box(60, 40)]);
    const sum = emptySmearSum(WORKING);
    addTrailFrame(
      sum,
      { image: frame(200), moving: first, standing: box(150, 10, 3) },
      { standingBlur: 0.05 },
    );
    const row = covered(sum.coverage, 92);
    // Around where it is: ten working pixels each way of the box at 120 to 144.
    expect(row[0]).toBeLessThanOrEqual(110);
    expect(row[row.length - 1]).toBeGreaterThanOrEqual(154);
    expect(covered(sum.coverage, 25)).toEqual([]);
  });

  it('draws a mover that went down as a streak down to where it is next', () => {
    const [first] = trackAreas([box(20, 10), box(20, 40)]);
    const sum = emptySmearSum(WORKING);
    addTrailFrame(
      sum,
      { image: frame(200), moving: first, standing: nothing },
      { standingBlur: 0 },
    );
    const column = Array.from(
      { length: WORKING.height },
      (_, y) => sum.coverage[y * WORKING.width + 50],
    )
      .map((value, y) => (value > 0.01 ? y : -1))
      .filter((y) => y >= 0);
    // The box covers working rows 20 to 44 and moves 60 working pixels down.
    expect(column[0]).toBeLessThanOrEqual(22);
    expect(column[column.length - 1]).toBeGreaterThanOrEqual(100);
  });

  it('softens a mover’s edge over a thousandth of the long edge, at least a pixel', () => {
    const softColumns = (size: { width: number; height: number }) => {
      const pixels: number[] = [];
      for (let y = 20; y < 60; y += 1)
        for (let x = 20; x < 60; x += 1) pixels.push(y * size.width + x);
      const still: TrackedArea = {
        pixels,
        centre: { x: 40, y: 40 },
        step: { x: 0, y: 0 },
        standing: false,
      };
      const standing = {
        ...size,
        data: new Uint8Array(size.width * size.height),
      };
      const sum = emptySmearSum(size);
      addTrailFrame(
        sum,
        { image: frame(200, size), moving: [still], standing },
        { standingBlur: 0 },
      );
      const row = sum.coverage.subarray(40 * size.width, 41 * size.width);
      return row.filter((value) => value > 0 && value < 1).length;
    };
    // Two box blurs of radius r soften a hard edge over 4r pixels; the mover has two edges in a row.
    expect(softColumns({ width: 400, height: 100 })).toBe(2 * 4 * 1);
    expect(softColumns({ width: 2000, height: 100 })).toBe(2 * 4 * 2);
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
