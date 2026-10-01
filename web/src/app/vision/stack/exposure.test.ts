import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { rowOf } from '../image/banded';
import type { AlignedFrame, Rect, Size } from '../types';
import { applyGain, estimateGain } from './exposure';
import {
  flatBanded,
  fullSpans,
  paintRect,
  pixelOf,
  rectSpans,
  type Rgb,
} from './synthetic.test-support';

const SIZE: Size = { width: 16, height: 12 };

/** A flat frame of `color`, covered everywhere or only inside `covered`. */
function frameOf(size: Size, color: Rgb, covered?: Rect): AlignedFrame {
  return {
    image: flatBanded(size, color),
    spans: covered ? rectSpans(size, covered) : fullSpans(size),
  };
}

describe('estimateGain', () => {
  it('estimates the ratio that brings a darker frame back to the reference', () => {
    const reference = flatBanded(SIZE, [200, 100, 50]);
    const frame = frameOf(SIZE, [160, 80, 40]);
    const gain = estimateGain(frame, reference);
    expect(gain[0]).toBeCloseTo(1.25, 6);
    expect(gain[1]).toBeCloseTo(1.25, 6);
    expect(gain[2]).toBeCloseTo(1.25, 6);
  });

  it('only looks at the overlap', () => {
    const reference = flatBanded(SIZE, [100, 100, 100]);
    const frame = frameOf(SIZE, [50, 50, 50], {
      x: 0,
      y: 0,
      width: 16,
      height: 4,
    });
    // Outside the covered strip the frame is wildly off; it must not matter.
    paintRect(frame.image, { x: 0, y: 4, width: 16, height: 8 }, [255, 50, 50]);
    expect(estimateGain(frame, reference)).toEqual([2, 2, 2]);
  });

  it('starts sampling each row at the first multiple of 4 inside its span', () => {
    const reference = flatBanded(SIZE, [100, 100, 100]);
    // Covered from column 1: columns 1–3 are off the sampling grid, column 4 is the first sample.
    const frame = frameOf(SIZE, [50, 50, 50], {
      x: 1,
      y: 0,
      width: 15,
      height: 12,
    });
    paintRect(
      frame.image,
      { x: 0, y: 0, width: 4, height: 12 },
      [255, 255, 255],
    );
    expect(estimateGain(frame, reference)).toEqual([2, 2, 2]);
  });

  it('clamps the ratio to [0.5, 2]', () => {
    const reference = flatBanded(SIZE, [240, 20, 100]);
    const frame = frameOf(SIZE, [20, 240, 100]);
    expect(estimateGain(frame, reference)).toEqual([2, 0.5, 1]);
  });

  it('returns unit gain without any overlap', () => {
    const reference = flatBanded(SIZE, [200, 200, 200]);
    const frame = frameOf(SIZE, [100, 100, 100], {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    expect(estimateGain(frame, reference)).toEqual([1, 1, 1]);
  });

  it('returns unit gain when a channel mean is zero in the frame or the reference', () => {
    const black = frameOf(SIZE, [0, 120, 120]);
    const lit = frameOf(SIZE, [90, 90, 90]);
    expect(estimateGain(black, lit.image)).toEqual([1, 1, 1]);
    expect(estimateGain(lit, black.image)).toEqual([1, 1, 1]);
  });

  it('samples whole rows, not just the first: a frame brighter lower down averages both', () => {
    const size: Size = { width: 8, height: 8 };
    const frame = frameOf(size, [40, 40, 40]);
    // Rows 0..3 at 40, rows 4..7 at 80: the sampled rows 0 and 4 average to 60.
    paintRect(frame.image, { x: 0, y: 4, width: 8, height: 4 }, [80, 80, 80]);
    const reference = flatBanded(size, [60, 60, 60]);
    expect(estimateGain(frame, reference)).toEqual([1, 1, 1]);
  });

  it('samples every fourth pixel in each direction, so odd columns are ignored', () => {
    const reference = flatBanded(SIZE, [100, 100, 100]);
    const frame = frameOf(SIZE, [100, 100, 100]);
    for (let y = 0; y < SIZE.height; y += 1) {
      for (let x = 0; x < SIZE.width; x += 1) {
        if (x % 4 === 0 && y % 4 === 0) continue;
        rowOf(frame.image, y)[x * 3] = 10;
      }
    }
    expect(estimateGain(frame, reference)).toEqual([1, 1, 1]);
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
            frameOf(SIZE, frameColor),
            flatBanded(SIZE, referenceColor),
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
  it('multiplies covered pixels with rounding', () => {
    const frame = frameOf(SIZE, [10, 11, 100]);
    applyGain(frame, [1.25, 1.25, 0.5]);
    expect(pixelOf(frame.image, 0, 0)).toEqual([13, 14, 50]);
    expect(pixelOf(frame.image, 1, 0)).toEqual([13, 14, 50]);
  });

  it('scales each channel by its own gain on every pixel, the last one included', () => {
    const size: Size = { width: 3, height: 2 };
    const frame = frameOf(size, [10, 20, 30]);
    applyGain(frame, [2, 1, 1.5]);
    expect(pixelOf(frame.image, 2, 1)).toEqual([20, 20, 45]);
    expect(pixelOf(frame.image, 0, 0)).toEqual([20, 20, 45]);
  });

  it('clamps at 255', () => {
    const frame = frameOf(SIZE, [200, 130, 128]);
    applyGain(frame, [2, 2, 2]);
    expect(pixelOf(frame.image, 0, 0)).toEqual([255, 255, 255]);
  });

  it('skips uncovered pixels', () => {
    const frame = frameOf(SIZE, [100, 100, 100], {
      x: 2,
      y: 0,
      width: 6,
      height: 12,
    });
    applyGain(frame, [2, 2, 2]);
    expect(pixelOf(frame.image, 1, 0)).toEqual([100, 100, 100]);
    expect(pixelOf(frame.image, 2, 0)).toEqual([200, 200, 200]);
    expect(pixelOf(frame.image, 7, 11)).toEqual([200, 200, 200]);
    expect(pixelOf(frame.image, 8, 11)).toEqual([100, 100, 100]);
  });

  it('touches only the rows asked for', () => {
    const frame = frameOf(SIZE, [100, 100, 100]);
    applyGain(frame, [2, 2, 2], { start: 3, end: 5 });
    expect(pixelOf(frame.image, 0, 2)).toEqual([100, 100, 100]);
    expect(pixelOf(frame.image, 0, 3)).toEqual([200, 200, 200]);
    expect(pixelOf(frame.image, 15, 4)).toEqual([200, 200, 200]);
    expect(pixelOf(frame.image, 0, 5)).toEqual([100, 100, 100]);
  });

  it('is the identity at unit gain', () => {
    const frame = frameOf(SIZE, [1, 128, 254]);
    applyGain(frame, [1, 1, 1]);
    expect(frame.image).toEqual(flatBanded(SIZE, [1, 128, 254]));
  });

  it('applies round(value × gain) clamped, for every value and gain', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.double({ min: 0.5, max: 2, noNaN: true }),
        (value, gain) => {
          const frame = frameOf({ width: 2, height: 1 }, [value, value, value]);
          applyGain(frame, [gain, gain, gain]);
          const expected = Math.min(255, Math.round(value * gain));
          expect(pixelOf(frame.image, 1, 0)).toEqual([
            expected,
            expected,
            expected,
          ]);
        },
      ),
    );
  });
});
