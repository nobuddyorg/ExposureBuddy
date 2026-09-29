import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Size } from '../types';
import { applyGain, estimateGain } from './exposure';
import { flatRgba, fullCoverage, rectCoverage } from './synthetic.test-support';

const SIZE: Size = { width: 16, height: 12 };

describe('estimateGain', () => {
  it('estimates the ratio that brings a darker frame back to the reference', () => {
    const reference = flatRgba(SIZE, [200, 100, 50]);
    const frame = flatRgba(SIZE, [160, 80, 40]);
    const gain = estimateGain(frame, reference, fullCoverage(SIZE));
    expect(gain[0]).toBeCloseTo(1.25, 6);
    expect(gain[1]).toBeCloseTo(1.25, 6);
    expect(gain[2]).toBeCloseTo(1.25, 6);
  });

  it('only looks at the overlap', () => {
    const reference = flatRgba(SIZE, [100, 100, 100]);
    const frame = flatRgba(SIZE, [50, 50, 50]);
    // Outside the covered strip the frame is wildly off; it must not matter.
    const coverage = rectCoverage(SIZE, { x: 0, y: 0, width: 16, height: 4 });
    for (let pixel = 4 * 16; pixel < 16 * 12; pixel += 1) {
      frame.data[pixel * 4] = 255;
    }
    expect(estimateGain(frame, reference, coverage)).toEqual([2, 2, 2]);
  });

  it('clamps the ratio to [0.5, 2]', () => {
    const reference = flatRgba(SIZE, [240, 20, 100]);
    const frame = flatRgba(SIZE, [20, 240, 100]);
    expect(estimateGain(frame, reference, fullCoverage(SIZE))).toEqual([
      2, 0.5, 1,
    ]);
  });

  it('returns unit gain without any overlap', () => {
    const reference = flatRgba(SIZE, [200, 200, 200]);
    const frame = flatRgba(SIZE, [100, 100, 100]);
    const coverage = new Uint8Array(SIZE.width * SIZE.height);
    expect(estimateGain(frame, reference, coverage)).toEqual([1, 1, 1]);
  });

  it('returns unit gain when a channel mean is zero in the frame or the reference', () => {
    const black = flatRgba(SIZE, [0, 120, 120]);
    const lit = flatRgba(SIZE, [90, 90, 90]);
    expect(estimateGain(black, lit, fullCoverage(SIZE))).toEqual([1, 1, 1]);
    expect(estimateGain(lit, black, fullCoverage(SIZE))).toEqual([1, 1, 1]);
  });

  it('samples whole rows, not just the first: a frame brighter lower down averages both', () => {
    const size: Size = { width: 8, height: 8 };
    const frame = flatRgba(size, [0, 0, 0]);
    // Rows 0..3 at 40, rows 4..7 at 80: the sampled rows 0 and 4 average to 60.
    for (let pixel = 0; pixel < size.width * size.height; pixel += 1) {
      frame.data[pixel * 4] = pixel < size.width * 4 ? 40 : 80;
    }
    const reference = flatRgba(size, [60, 60, 60]);
    const [red] = estimateGain(frame, reference, fullCoverage(size));
    expect(red).toBeCloseTo(1, 12);
  });

  it('samples every fourth pixel in each direction, so odd columns are ignored', () => {
    const reference = flatRgba(SIZE, [100, 100, 100]);
    const frame = flatRgba(SIZE, [100, 100, 100]);
    for (let y = 0; y < SIZE.height; y += 1) {
      for (let x = 0; x < SIZE.width; x += 1) {
        if (x % 4 === 0 && y % 4 === 0) continue;
        frame.data[(y * SIZE.width + x) * 4] = 10;
      }
    }
    expect(estimateGain(frame, reference, fullCoverage(SIZE))).toEqual([
      1, 1, 1,
    ]);
  });

  it('never leaves [0.5, 2] whatever the colors', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 1, max: 255 }),
        ),
        fc.tuple(
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 1, max: 255 }),
        ),
        (frameColor, referenceColor) => {
          const gain = estimateGain(
            flatRgba(SIZE, frameColor),
            flatRgba(SIZE, referenceColor),
            fullCoverage(SIZE),
          );
          for (let channel = 0; channel < 3; channel += 1) {
            const expected = Math.min(
              2,
              Math.max(0.5, referenceColor[channel] / frameColor[channel]),
            );
            expect(gain[channel]).toBeCloseTo(expected, 9);
          }
        },
      ),
    );
  });
});

describe('applyGain', () => {
  it('multiplies covered pixels with rounding and leaves alpha alone', () => {
    const frame = flatRgba(SIZE, [10, 11, 100]);
    frame.data[3] = 77;
    applyGain(frame, [1.25, 1.25, 0.5], fullCoverage(SIZE));
    expect(Array.from(frame.data.subarray(0, 4))).toEqual([13, 14, 50, 77]);
    expect(Array.from(frame.data.subarray(4, 8))).toEqual([13, 14, 50, 255]);
  });

  it('scales each channel by its own gain on every pixel, the last one included', () => {
    const size: Size = { width: 3, height: 2 };
    const frame = flatRgba(size, [10, 20, 30]);
    applyGain(frame, [2, 1, 1.5], fullCoverage(size));
    const last = frame.data.subarray((size.width * size.height - 1) * 4);
    expect(Array.from(last)).toEqual([20, 20, 45, 255]);
    expect(Array.from(frame.data.subarray(0, 4))).toEqual([20, 20, 45, 255]);
  });

  it('clamps at 255', () => {
    const frame = flatRgba(SIZE, [200, 130, 128]);
    applyGain(frame, [2, 2, 2], fullCoverage(SIZE));
    expect(Array.from(frame.data.subarray(0, 3))).toEqual([255, 255, 255]);
  });

  it('skips uncovered pixels', () => {
    const frame = flatRgba(SIZE, [100, 100, 100]);
    const coverage = rectCoverage(SIZE, { x: 0, y: 0, width: 8, height: 12 });
    applyGain(frame, [2, 2, 2], coverage);
    const covered = frame.data.subarray(0, 4);
    const uncovered = frame.data.subarray(8 * 4, 8 * 4 + 4);
    expect(Array.from(covered)).toEqual([200, 200, 200, 255]);
    expect(Array.from(uncovered)).toEqual([100, 100, 100, 255]);
  });

  it('is the identity at unit gain', () => {
    const frame = flatRgba(SIZE, [1, 128, 254]);
    const before = new Uint8ClampedArray(frame.data);
    applyGain(frame, [1, 1, 1], fullCoverage(SIZE));
    expect(frame.data).toEqual(before);
  });

  it('applies round(value × gain) clamped, for every value and gain', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.double({ min: 0.5, max: 2, noNaN: true }),
        (value, gain) => {
          const frame = flatRgba({ width: 2, height: 1 }, [
            value,
            value,
            value,
          ]);
          applyGain(frame, [gain, gain, gain], new Uint8Array([1, 1]));
          const expected = Math.min(255, Math.round(value * gain));
          expect(Array.from(frame.data.subarray(0, 3))).toEqual([
            expected,
            expected,
            expected,
          ]);
        },
      ),
    );
  });
});
