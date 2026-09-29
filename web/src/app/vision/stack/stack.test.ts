import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { AlignedFrame, Rect, Size } from '../types';
import { fullCoverageRect, selectMedian, stackFrames } from './stack';
import {
  flatFrame,
  flatRgba,
  fullCoverage,
  isInside,
  isRectCovered,
  paintRect,
  rectCoverage,
  type Rgb,
} from './synthetic.test-support';

const SIZE: Size = { width: 12, height: 8 };
const BACKGROUND: Rgb = [40, 90, 140];
const PERSON: Rgb = [240, 200, 160];
const PERSON_RECT: Rect = { x: 3, y: 2, width: 4, height: 3 };

function isUnderPerson(pixel: number): boolean {
  const x = pixel % SIZE.width;
  const y = Math.floor(pixel / SIZE.width);
  return (
    x >= PERSON_RECT.x &&
    x < PERSON_RECT.x + PERSON_RECT.width &&
    y >= PERSON_RECT.y &&
    y < PERSON_RECT.y + PERSON_RECT.height
  );
}

function burstWithPerson(frameCount: number): AlignedFrame[] {
  const frames = Array.from({ length: frameCount }, () =>
    flatFrame(SIZE, BACKGROUND),
  );
  paintRect(frames[1].image, PERSON_RECT, PERSON);
  return frames;
}

function frameOfValues(values: readonly number[]): AlignedFrame[] {
  return values.map((value) =>
    flatFrame({ width: 1, height: 1 }, [value, value, value]),
  );
}

function progressOf(size: Size): number[] {
  const fractions: number[] = [];
  stackFrames([flatFrame(size, BACKGROUND)], {
    onProgress: (fraction) => fractions.push(fraction),
  });
  return fractions;
}

describe('stackFrames', () => {
  const stack = stackFrames(burstWithPerson(5));
  const pixelCount = SIZE.width * SIZE.height;

  it('takes the median from the static background everywhere', () => {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      expect(
        Array.from(stack.median.subarray(pixel * 4, pixel * 4 + 4)),
      ).toEqual([...BACKGROUND, 255]);
    }
  });

  it('lifts the mean only under the person', () => {
    const lifted = BACKGROUND.map((value, channel) =>
      Math.round((4 * value + PERSON[channel]) / 5),
    );
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const expected = isUnderPerson(pixel) ? lifted : BACKGROUND;
      expect(Array.from(stack.mean.subarray(pixel * 4, pixel * 4 + 4))).toEqual(
        [...expected, 255],
      );
    }
  });

  it('reports deviation exactly under the person: the largest channel spread', () => {
    // One outlier out of five: mean |value − median| is (240 − 40) / 5 = 40 in red, the widest channel.
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      expect(stack.deviation[pixel]).toBe(isUnderPerson(pixel) ? 40 : 0);
    }
  });

  it('counts every frame in the coverage and reports the frame count', () => {
    expect(stack.coverage.every((count) => count === 5)).toBe(true);
    expect(stack.frameCount).toBe(5);
    expect(stack.width).toBe(SIZE.width);
    expect(stack.height).toBe(SIZE.height);
  });

  it('averages the two middle values for an even frame count', () => {
    const result = stackFrames(frameOfValues([10, 200, 21, 30]));
    expect(result.median[0]).toBe(Math.round((21 + 30) / 2));
    expect(result.mean[0]).toBe(Math.round((10 + 200 + 21 + 30) / 4));
  });

  it('excludes a frame where its coverage is 0 and reports the count per pixel', () => {
    const frames = burstWithPerson(5);
    const stripSize = { width: SIZE.width, height: 4 };
    // The person frame only covers the top half, so the person is only stacked there.
    frames[1] = {
      image: frames[1].image,
      coverage: rectCoverage(SIZE, { x: 0, y: 0, ...stripSize }),
    };
    const result = stackFrames(frames);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const topHalf = pixel < 4 * SIZE.width;
      expect(result.coverage[pixel]).toBe(topHalf ? 5 : 4);
      expect(result.deviation[pixel] > 0).toBe(topHalf && isUnderPerson(pixel));
    }
  });

  it('leaves a pixel no frame covers black and transparent with deviation 0', () => {
    const frame = flatFrame({ width: 2, height: 1 }, [50, 60, 70]);
    frame.coverage[1] = 0;
    const result = stackFrames([frame]);
    expect(Array.from(result.median)).toEqual([50, 60, 70, 255, 0, 0, 0, 0]);
    expect(Array.from(result.mean)).toEqual([50, 60, 70, 255, 0, 0, 0, 0]);
    expect(Array.from(result.coverage)).toEqual([1, 0]);
    expect(Array.from(result.deviation)).toEqual([0, 0]);
  });

  it('clamps the deviation to 255 and rounds it', () => {
    const wide = stackFrames(frameOfValues([0, 255]));
    // Median 128 (rounded from 127.5), deviations 128 and 127 → mean 127.5 → 128.
    expect(wide.median[0]).toBe(128);
    expect(wide.deviation[0]).toBe(128);
  });

  it('throws on mismatched sizes or an empty burst', () => {
    const small = flatFrame({ width: 2, height: 2 }, BACKGROUND);
    const wide = flatFrame({ width: 3, height: 2 }, BACKGROUND);
    expect(() => stackFrames([small, wide])).toThrow(/one size/);
    const shortCoverage = { image: small.image, coverage: new Uint8Array(3) };
    expect(() => stackFrames([small, shortCoverage])).toThrow(/one size/);
    expect(() => stackFrames([])).toThrow(/at least one/);
  });

  it('rejects a frame whose image differs in one dimension even when its coverage length matches', () => {
    const base = flatFrame({ width: 2, height: 3 }, BACKGROUND);
    const coverage = fullCoverage({ width: 2, height: 3 });
    const wider = {
      image: flatRgba({ width: 3, height: 3 }, BACKGROUND),
      coverage,
    };
    const taller = {
      image: flatRgba({ width: 2, height: 4 }, BACKGROUND),
      coverage,
    };
    expect(() => stackFrames([base, wider])).toThrow(/one size/);
    expect(() => stackFrames([base, taller])).toThrow(/one size/);
  });

  it('reports monotone progress that reaches 1 exactly once, at the end', () => {
    const fractions: number[] = [];
    stackFrames(burstWithPerson(3), {
      onProgress: (fraction) => fractions.push(fraction),
    });
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.filter((fraction) => fraction === 1)).toHaveLength(1);
    for (let index = 1; index < fractions.length; index += 1) {
      expect(fractions[index]).toBeGreaterThan(fractions[index - 1]);
    }
  });

  it('reports intermediate progress every few percent on a tall image', () => {
    const fractions = progressOf({ width: 1, height: 200 });
    expect(fractions.length).toBeGreaterThan(20);
    expect(fractions.length).toBeLessThan(60);
  });

  it('reports the fraction of rows done after every row when each row is a full step', () => {
    expect(progressOf({ width: 1, height: 10 })).toEqual([
      0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1,
    ]);
  });

  it('reports a row that lands exactly on the step size', () => {
    expect(progressOf({ width: 1, height: 50 })[0]).toBe(0.02);
  });

  it('reports 1 after the last row even when it is less than a step past the previous report', () => {
    const fractions = progressOf({ width: 1, height: 51 });
    expect(fractions.at(-2)).toBe(50 / 51);
    expect(fractions.at(-1)).toBe(1);
  });

  it('gives the constant back for a constant stack and keeps the median within the range', () => {
    const color = fc.tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 4 }),
        fc.array(color, { minLength: 1, maxLength: 9 }),
        (width, height, colors) => {
          const size = { width, height };
          const constant = stackFrames(
            colors.map(() => flatFrame(size, colors[0])),
          );
          const varied = stackFrames(colors.map((rgb) => flatFrame(size, rgb)));
          for (let pixel = 0; pixel < width * height; pixel += 1) {
            for (let channel = 0; channel < 3; channel += 1) {
              const index = pixel * 4 + channel;
              expect(constant.median[index]).toBe(colors[0][channel]);
              expect(constant.mean[index]).toBe(colors[0][channel]);
              const values = colors.map((rgb) => rgb[channel]);
              expect(varied.median[index]).toBeGreaterThanOrEqual(
                Math.min(...values),
              );
              expect(varied.median[index]).toBeLessThanOrEqual(
                Math.max(...values),
              );
            }
            expect(constant.deviation[pixel]).toBe(0);
          }
        },
      ),
    );
  });
});

describe('selectMedian', () => {
  it('matches the median of the sorted values for any count', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: 1,
          maxLength: 40,
        }),
        (values) => {
          const sorted = [...values].sort((a, b) => a - b);
          const middle = sorted.length >> 1;
          const expected =
            sorted.length % 2 === 1
              ? sorted[middle]
              : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
          const scratch = new Uint8Array(values);
          expect(selectMedian(scratch, values.length)).toBe(expected);
          expect([...scratch].sort((a, b) => a - b)).toEqual(sorted);
        },
      ),
    );
  });

  it('ignores the values beyond count that a longer scratch array still holds', () => {
    const scratch = new Uint8Array([10, 20, 30, 40, 0]);
    expect(selectMedian(scratch, 4)).toBe(25);
  });
});

describe('fullCoverageRect', () => {
  const size: Size = { width: 8, height: 6 };

  it('returns the whole image when everything is covered', () => {
    expect(fullCoverageRect(fullCoverage(size), size, 1)).toEqual({
      x: 0,
      y: 0,
      width: 8,
      height: 6,
    });
  });

  it('returns a zero rect when nothing reaches the required count', () => {
    expect(fullCoverageRect(fullCoverage(size), size, 2)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it('treats a required count of 0 as fully covered', () => {
    const empty = new Uint8Array(size.width * size.height);
    expect(fullCoverageRect(empty, size, 0)).toEqual({
      x: 0,
      y: 0,
      width: 8,
      height: 6,
    });
  });

  it('avoids a hole by taking the largest side of it', () => {
    const coverage = fullCoverage(size);
    // A 2 × 2 hole near the right edge leaves a 5-wide full-height rectangle on the left.
    coverage[2 * 8 + 5] = 0;
    coverage[2 * 8 + 6] = 0;
    coverage[3 * 8 + 5] = 0;
    coverage[3 * 8 + 6] = 0;
    expect(fullCoverageRect(coverage, size, 1)).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 6,
    });
  });

  it('fits under a diagonal edge', () => {
    const coverage = fullCoverage(size);
    // Column x is uncovered above row x: the covered region is a staircase.
    for (let y = 0; y < size.height; y += 1) {
      for (let x = 0; x < size.width; x += 1) {
        if (y < x) coverage[y * size.width + x] = 0;
      }
    }
    const rect = fullCoverageRect(coverage, size, 1);
    expect(isRectCovered(coverage, size, rect, 1)).toBe(true);
    // Candidates: 6 rows × 1 col = 6, 5 × 2 = 10, 4 × 3 = 12, 3 × 4 = 12, 2 × 5 = 10; the first maximum wins.
    expect(rect.width * rect.height).toBe(12);
  });

  it('counts frames against the required count', () => {
    const image = flatRgba(size, [1, 2, 3]);
    const partial = {
      image,
      coverage: rectCoverage(size, { x: 2, y: 1, width: 4, height: 4 }),
    };
    const stacked = stackFrames([
      { image, coverage: fullCoverage(size) },
      partial,
    ]);
    expect(fullCoverageRect(stacked.coverage, size, 2)).toEqual({
      x: 2,
      y: 1,
      width: 4,
      height: 4,
    });
    expect(fullCoverageRect(stacked.coverage, size, 1)).toEqual({
      x: 0,
      y: 0,
      width: 8,
      height: 6,
    });
  });

  it('returns a covered rectangle that cannot grow by one pixel in any direction', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        fc.integer({ min: 1, max: 7 }),
        fc.array(fc.integer({ min: 0, max: 2 }), {
          minLength: 49,
          maxLength: 49,
        }),
        (width, height, cells) => {
          const shape = { width, height };
          const coverage = new Uint8Array(cells.slice(0, width * height));
          const rect = fullCoverageRect(coverage, shape, 1);
          const anyCovered = coverage.some((count) => count >= 1);
          expect(rect.width * rect.height > 0).toBe(anyCovered);
          if (!anyCovered) return;
          expect(isInside(rect, shape)).toBe(true);
          expect(isRectCovered(coverage, shape, rect, 1)).toBe(true);
          const grown: Rect[] = [
            { ...rect, width: rect.width + 1 },
            { ...rect, height: rect.height + 1 },
            { ...rect, x: rect.x - 1, width: rect.width + 1 },
            { ...rect, y: rect.y - 1, height: rect.height + 1 },
          ];
          for (const candidate of grown) {
            const fits =
              isInside(candidate, shape) &&
              isRectCovered(coverage, shape, candidate, 1);
            expect(fits).toBe(false);
          }
        },
      ),
    );
  });
});
