import { describe, expect, it } from 'vitest';

import { MAX_STAMPS, addSmear, emptySmearSum } from './smear';
import type { GrayImage, RgbaImage } from '../types';

const SIZE = { width: 40, height: 10 };

function frameOf(red: number): RgbaImage {
  const data = new Uint8ClampedArray(SIZE.width * SIZE.height * 4);
  for (let pixel = 0; pixel < SIZE.width * SIZE.height; pixel += 1)
    data.set([red, 0, 0, 255], pixel * 4);
  return { ...SIZE, data };
}

function dotAt(x: number, y: number, value = 255): GrayImage {
  const data = new Uint8Array(SIZE.width * SIZE.height);
  data[y * SIZE.width + x] = value;
  return { ...SIZE, data };
}

const coverageRow = (sum: ReturnType<typeof emptySmearSum>, y: number) =>
  Array.from(sum.coverage.slice(y * SIZE.width, (y + 1) * SIZE.width));

describe('addSmear', () => {
  it('puts a mover that goes nowhere where it is, once', () => {
    const sum = emptySmearSum(SIZE);
    addSmear(sum, frameOf(200), dotAt(5, 3), { dx: 0, dy: 0, centred: false });
    expect(coverageRow(sum, 3).filter((value) => value > 0)).toEqual([1]);
    expect(sum.colour[(3 * SIZE.width + 5) * 3]).toBeCloseTo(200);
  });

  it('draws a streak from the mover to where it went, with the coverage spread evenly', () => {
    const sum = emptySmearSum(SIZE);
    addSmear(sum, frameOf(100), dotAt(5, 3), { dx: 9, dy: 0, centred: false });
    const row = coverageRow(sum, 3);
    expect(row.slice(5, 15).every((value) => value > 0)).toBe(true);
    expect(
      row
        .slice(0, 5)
        .concat(row.slice(15))
        .every((v) => v === 0),
    ).toBe(true);
    expect(row.reduce((total, value) => total + value, 0)).toBeCloseTo(1);
  });

  it('follows a diagonal path', () => {
    const sum = emptySmearSum(SIZE);
    addSmear(sum, frameOf(100), dotAt(5, 2), { dx: 4, dy: 4, centred: false });
    expect(sum.coverage[6 * SIZE.width + 9]).toBeGreaterThan(0);
  });

  it('spreads a centred path around the mover', () => {
    const sum = emptySmearSum(SIZE);
    addSmear(sum, frameOf(100), dotAt(20, 3), { dx: 10, dy: 0, centred: true });
    const row = coverageRow(sum, 3);
    expect(row[15]).toBeGreaterThan(0);
    expect(row[25]).toBeGreaterThan(0);
    expect(row[14]).toBe(0);
    expect(row[26]).toBe(0);
  });

  it('takes a half-covered pixel at half strength and leaves out what is not covered', () => {
    const sum = emptySmearSum(SIZE);
    addSmear(sum, frameOf(200), dotAt(5, 3, 128), {
      dx: 0,
      dy: 0,
      centred: false,
    });
    expect(sum.coverage[3 * SIZE.width + 5]).toBeCloseTo(128 / 255);
    expect(sum.colour[(3 * SIZE.width + 5) * 3]).toBeCloseTo(200 * (128 / 255));
    expect(sum.coverage.reduce((total, value) => total + value, 0)).toBeCloseTo(
      128 / 255,
    );
  });

  it('lets a path run off the edge without writing outside', () => {
    const sum = emptySmearSum(SIZE);
    addSmear(sum, frameOf(100), dotAt(38, 3), {
      dx: 30,
      dy: 0,
      centred: false,
    });
    expect(coverageRow(sum, 3)[39]).toBeGreaterThan(0);
    expect(sum.coverage.length).toBe(SIZE.width * SIZE.height);
  });

  it('caps the copies of a very long path', () => {
    const sum = emptySmearSum({ width: 5000, height: 1 });
    const data = new Uint8Array(5000);
    data[0] = 255;
    addSmear(
      sum,
      { width: 5000, height: 1, data: new Uint8ClampedArray(5000 * 4) },
      { width: 5000, height: 1, data },
      { dx: 4000, dy: 0, centred: false },
    );
    const stamped = Array.from(sum.coverage).filter((value) => value > 0);
    expect(stamped.length).toBe(MAX_STAMPS);
  });
});
