import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { AlignedFrame, Rect, RowSpans, Size } from '../types';
import { emptyStack, fullCoverageRect, selectMedian, stackRows } from './stack';
import {
  allPixels,
  flatFrame,
  fullSpans,
  isInside,
  isRectCovered,
  paintRect,
  pixelOf,
  rectSpans,
  stackFrames,
  type Rgb,
} from './synthetic.test-support';

const SIZE: Size = { width: 12, height: 8 };
const FULL: Rect = { x: 0, y: 0, ...SIZE };
const BACKGROUND: Rgb = [40, 90, 140];
const PERSON: Rgb = [240, 200, 160];
const PERSON_RECT: Rect = { x: 3, y: 2, width: 4, height: 3 };

function isUnderPerson(x: number, y: number): boolean {
  return (
    x >= PERSON_RECT.x &&
    x < PERSON_RECT.x + PERSON_RECT.width &&
    y >= PERSON_RECT.y &&
    y < PERSON_RECT.y + PERSON_RECT.height
  );
}

function burstWithPerson(frameCount: number, size = SIZE): AlignedFrame[] {
  const frames = Array.from({ length: frameCount }, () =>
    flatFrame(size, BACKGROUND),
  );
  paintRect(frames[1].image, PERSON_RECT, PERSON);
  return frames;
}

function framesOfValues(values: readonly number[]): AlignedFrame[] {
  return values.map((value) =>
    flatFrame({ width: 1, height: 1 }, [value, value, value]),
  );
}

const ONE_PIXEL: Rect = { x: 0, y: 0, width: 1, height: 1 };

function progressOf(size: Size): number[] {
  const fractions: number[] = [];
  stackFrames([flatFrame(size, BACKGROUND)], {
    rect: { x: 0, y: 0, ...size },
    onProgress: (fraction) => fractions.push(fraction),
  });
  return fractions;
}

describe('stackFrames backgrounds', () => {
  it('gives the static background in every mode where a person covers a minority of frames', () => {
    const result = stackFrames(burstWithPerson(5), { rect: FULL });
    for (const layer of Object.values(result.backgrounds)) {
      expect(pixelOf(layer, PERSON_RECT.x, PERSON_RECT.y)).toEqual(BACKGROUND);
    }
  });

  it('keeps each channel of each pixel in its own place in every mode', () => {
    const colors: Rgb[] = [
      [10, 20, 30],
      [40, 50, 60],
      [70, 80, 90],
    ];
    const frames = Array.from({ length: 5 }, () =>
      flatFrame({ width: 3, height: 1 }, [0, 0, 0]),
    );
    for (const { image } of frames) {
      colors.forEach((color, x) =>
        paintRect(image, { x, y: 0, width: 1, height: 1 }, color),
      );
    }
    const result = stackFrames(frames, {
      rect: { x: 0, y: 0, width: 3, height: 1 },
    });
    for (const layer of Object.values(result.backgrounds)) {
      expect(allPixels(layer)).toEqual(colors.flat());
    }
  });
});

describe('stackFrames', () => {
  const stack = stackFrames(burstWithPerson(5), { rect: FULL });

  it('takes the median from the static background everywhere', () => {
    expect(allPixels(stack.backgrounds.median)).toEqual(
      Array.from({ length: SIZE.width * SIZE.height }, () => BACKGROUND).flat(),
    );
  });

  it('lifts the mean only under the person', () => {
    const lifted = BACKGROUND.map((value, channel) =>
      Math.round((4 * value + PERSON[channel]) / 5),
    );
    for (let y = 0; y < SIZE.height; y += 1) {
      for (let x = 0; x < SIZE.width; x += 1) {
        expect(pixelOf(stack.mean, x, y)).toEqual(
          isUnderPerson(x, y) ? lifted : [...BACKGROUND],
        );
      }
    }
  });

  it('reports the frame count and the size of the rect', () => {
    expect(stack.frameCount).toBe(5);
    expect(stack.width).toBe(SIZE.width);
    expect(stack.height).toBe(SIZE.height);
  });

  it('keeps the brightest value of each channel on its own', () => {
    const frames = [
      flatFrame({ width: 1, height: 1 }, [200, 10, 30]),
      flatFrame({ width: 1, height: 1 }, [20, 220, 40]),
      flatFrame({ width: 1, height: 1 }, [5, 6, 250]),
    ];
    const result = stackFrames(frames, { rect: ONE_PIXEL });
    expect(pixelOf(result.brightest, 0, 0)).toEqual([200, 220, 250]);
  });

  it('averages the two middle values for an even frame count', () => {
    const result = stackFrames(framesOfValues([10, 200, 21, 30]), {
      rect: ONE_PIXEL,
    });
    expect(pixelOf(result.backgrounds.median, 0, 0)[0]).toBe(
      Math.round((21 + 30) / 2),
    );
    expect(pixelOf(result.mean, 0, 0)[0]).toBe(
      Math.round((10 + 200 + 21 + 30) / 4),
    );
  });

  it('stacks only the rect, reading each frame at the rect offset', () => {
    const rect: Rect = { x: 2, y: 1, width: 5, height: 3 };
    const result = stackFrames(burstWithPerson(5), { rect });
    expect([result.width, result.height]).toEqual([5, 3]);
    const lifted = BACKGROUND.map((value, channel) =>
      Math.round((4 * value + PERSON[channel]) / 5),
    );
    for (let y = 0; y < rect.height; y += 1) {
      for (let x = 0; x < rect.width; x += 1) {
        expect(pixelOf(result.mean, x, y)).toEqual(
          isUnderPerson(rect.x + x, rect.y + y) ? lifted : [...BACKGROUND],
        );
      }
    }
  });

  it('frees every band of the frames once it is stacked, the ones above the rect included', () => {
    const tall = { width: 2, height: 150 };
    const frames = [flatFrame(tall, BACKGROUND, 7), flatFrame(tall, PERSON, 7)];
    const result = stackFrames(frames, {
      rect: { x: 0, y: 30, width: 2, height: 100 },
    });
    // Rows 30–129 are stacked: the 18 bands wholly above row 130 are gone, the band holding row 130 and those below stay.
    for (const frame of frames) {
      const lengths = frame.image.bands.map((band) => band.length);
      expect(lengths.slice(0, 18).every((length) => length === 0)).toBe(true);
      expect(lengths.slice(18).every((length) => length > 0)).toBe(true);
    }
    expect(pixelOf(result.mean, 1, 99)).toEqual(
      BACKGROUND.map((value, channel) =>
        Math.round((value + PERSON[channel]) / 2),
      ),
    );
  });

  it('reports monotone progress that reaches 1 exactly once, at the end', () => {
    const fractions: number[] = [];
    const tall = { width: 3, height: 300 };
    stackFrames([flatFrame(tall, BACKGROUND), flatFrame(tall, PERSON)], {
      rect: { x: 0, y: 0, width: 3, height: 300 },
      onProgress: (fraction) => fractions.push(fraction),
    });
    expect(fractions.at(-1)).toBe(1);
    expect(fractions.filter((fraction) => fraction === 1)).toHaveLength(1);
    for (let index = 1; index < fractions.length; index += 1) {
      expect(fractions[index]).toBeGreaterThan(fractions[index - 1]);
    }
  });

  it('reports the fraction of rows done after every band', () => {
    expect(progressOf({ width: 1, height: 256 })).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('reports a band only when it adds at least a step', () => {
    // 64 of 6400 rows is 1 %: no more than every second band reaches the 2 % step.
    const fractions = progressOf({ width: 1, height: 6400 });
    expect(fractions[0]).toBe(0.02);
    expect(fractions.length).toBeGreaterThan(25);
    expect(fractions.length).toBeLessThanOrEqual(50);
    for (let index = 1; index < fractions.length - 1; index += 1) {
      expect(fractions[index] - fractions[index - 1]).toBeGreaterThanOrEqual(
        0.02,
      );
    }
  });

  it('reports 1 after the last band even when it is less than a step past the previous report', () => {
    expect(progressOf({ width: 1, height: 65 })).toEqual([64 / 65, 1]);
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
          const rect = { x: 0, y: 0, ...size };
          const constant = stackFrames(
            colors.map(() => flatFrame(size, colors[0])),
            { rect },
          );
          const varied = stackFrames(
            colors.map((rgb) => flatFrame(size, rgb)),
            { rect },
          );
          const constantMedian = allPixels(constant.backgrounds.median);
          const constantMean = allPixels(constant.mean);
          const variedMedian = allPixels(varied.backgrounds.median);
          constantMedian.forEach((value, index) => {
            const channel = index % 3;
            expect(value).toBe(colors[0][channel]);
            expect(constantMean[index]).toBe(colors[0][channel]);
            const values = colors.map((rgb) => rgb[channel]);
            expect(variedMedian[index]).toBeGreaterThanOrEqual(
              Math.min(...values),
            );
            expect(variedMedian[index]).toBeLessThanOrEqual(
              Math.max(...values),
            );
          });
        },
      ),
    );
  });
});

describe('stackRows', () => {
  const tall = { width: 2, height: 150 };
  const rect: Rect = { x: 0, y: 10, width: 2, height: 130 };

  function tallBurst(): AlignedFrame[] {
    const frames = [
      flatFrame(tall, BACKGROUND, 64),
      flatFrame(tall, BACKGROUND, 64),
      flatFrame(tall, PERSON, 64),
    ];
    paintRect(frames[1].image, { x: 1, y: 70, width: 1, height: 3 }, PERSON);
    return frames;
  }

  it('starts empty, the size of the rect', () => {
    const stack = emptyStack(rect, 3);
    expect(stack).toMatchObject({ width: 2, height: 130, frameCount: 3 });
    expect(stack.mean.bands.every((band) => band.length === 0)).toBe(true);
  });

  it('stacks strip by strip into the same result as all rows at once', () => {
    const whole = emptyStack(rect, 3);
    stackRows(tallBurst(), whole, { rect, rows: { start: 0, end: 150 } });

    const inStrips = emptyStack(rect, 3);
    // Strips of 50 rows: the result's bands (64 rows from the rect's top) straddle them.
    for (const start of [0, 50, 100])
      stackRows(tallBurst(), inStrips, {
        rect,
        rows: { start, end: start + 50 },
      });
    expect(allPixels(inStrips.mean)).toEqual(allPixels(whole.mean));
    expect(allPixels(inStrips.brightest)).toEqual(allPixels(whole.brightest));
    for (const mode of ['median', 'trimmed', 'clipped', 'mode'] as const)
      expect(allPixels(inStrips.backgrounds[mode])).toEqual(
        allPixels(whole.backgrounds[mode]),
      );
    expect(pixelOf(whole.backgrounds.median, 1, 61)).toEqual([...PERSON]);
  });

  it('reports progress within the rows it was given, from wherever they start', () => {
    const square = { width: 1, height: 256 };
    const progress: number[] = [];
    stackRows(
      [flatFrame(square, BACKGROUND)],
      emptyStack({ x: 0, y: 0, ...square }, 1),
      {
        rect: { x: 0, y: 0, ...square },
        rows: { start: 64, end: 256 },
        onProgress: (fraction) => progress.push(fraction),
      },
    );
    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
  });

  it('stacks nothing and reports nothing for rows outside the rect', () => {
    const stack = emptyStack(rect, 3);
    const progress: number[] = [];
    stackRows(tallBurst(), stack, {
      rect,
      rows: { start: 0, end: 10 },
      onProgress: (fraction) => progress.push(fraction),
    });
    expect(stack.mean.bands.every((band) => band.length === 0)).toBe(true);
    expect(progress).toEqual([]);
  });

  it('frees every band of the frames once the last row is stacked', () => {
    const frames = tallBurst();
    stackRows(frames, emptyStack(rect, 3), {
      rect: { x: 0, y: 0, ...tall },
      rows: { start: 0, end: 150 },
    });
    for (const frame of frames)
      expect(frame.image.bands.every((band) => band.length === 0)).toBe(true);
  });

  it('throws on an empty burst', () => {
    expect(() =>
      stackRows([], emptyStack(rect, 0), { rect, rows: { start: 0, end: 1 } }),
    ).toThrow(/at least one/);
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

/** Spans whose row y covers [starts[y], ends[y]). */
function spansOf(starts: readonly number[], ends: readonly number[]): RowSpans {
  return { start: Int32Array.from(starts), end: Int32Array.from(ends) };
}

describe('fullCoverageRect', () => {
  const size: Size = { width: 8, height: 6 };

  it('returns the whole image when everything is covered', () => {
    expect(fullCoverageRect([fullSpans(size)], size)).toEqual({
      x: 0,
      y: 0,
      width: 8,
      height: 6,
    });
  });

  it('returns a zero rect when no pixel is covered by every frame', () => {
    const left = rectSpans(size, { x: 0, y: 0, width: 4, height: 6 });
    const right = rectSpans(size, { x: 4, y: 0, width: 4, height: 6 });
    expect(fullCoverageRect([left, right], size)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it('returns the overlap of two shifted frames', () => {
    const full = fullSpans(size);
    const partial = rectSpans(size, { x: 2, y: 1, width: 4, height: 4 });
    expect(fullCoverageRect([full, partial], size)).toEqual({
      x: 2,
      y: 1,
      width: 4,
      height: 4,
    });
  });

  it('avoids a notch by taking the largest side of it', () => {
    // Rows 2 and 3 end at column 5: a 5-wide full-height rectangle beats the full-width rows around the notch.
    const notched = spansOf([0, 0, 0, 0, 0, 0], [8, 8, 5, 5, 8, 8]);
    expect(fullCoverageRect([notched], size)).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 6,
    });
  });

  it('keeps the first of two equal rectangles', () => {
    // Columns 0–1 run the full height, columns 2–3 only rows 0–2: 2 × 6 ties with 4 × 3.
    const tee = spansOf([0, 0, 0, 0, 0, 0], [4, 4, 4, 2, 2, 2]);
    expect(fullCoverageRect([tee], { width: 4, height: 6 })).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 3,
    });
  });

  it('fits under a diagonal edge', () => {
    // Row y covers columns 0 to y: the covered region is a staircase.
    const staircase = spansOf([0, 0, 0, 0, 0, 0], [1, 2, 3, 4, 5, 6]);
    const rect = fullCoverageRect([staircase], size);
    expect(isRectCovered([staircase], rect)).toBe(true);
    // Candidates: 6 rows × 1 col = 6, 5 × 2 = 10, 4 × 3 = 12, 3 × 4 = 12, 2 × 5 = 10; the first maximum wins.
    expect(rect).toEqual({ x: 0, y: 2, width: 3, height: 4 });
  });

  it('returns a covered rectangle that cannot grow by one pixel in any direction', () => {
    const span = fc
      .tuple(fc.integer({ min: 0, max: 8 }), fc.integer({ min: 0, max: 8 }))
      .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        fc.integer({ min: 1, max: 7 }),
        fc.array(fc.array(span, { minLength: 7, maxLength: 7 }), {
          minLength: 1,
          maxLength: 3,
        }),
        (width, height, frames) => {
          const shape = { width, height };
          const spans = frames.map((rows) =>
            spansOf(
              rows.slice(0, height).map(([start]) => Math.min(start, width)),
              rows.slice(0, height).map(([, end]) => Math.min(end, width)),
            ),
          );
          const rect = fullCoverageRect(spans, shape);
          const anyCovered = Array.from(
            { length: height },
            (_, y) =>
              spans.every((row) => row.start[y] < row.end[y]) &&
              Math.max(...spans.map((row) => row.start[y])) <
                Math.min(...spans.map((row) => row.end[y])),
          ).some(Boolean);
          expect(rect.width * rect.height > 0).toBe(anyCovered);
          if (!anyCovered) return;
          expect(isInside(rect, shape)).toBe(true);
          expect(isRectCovered(spans, rect)).toBe(true);
          const grown: Rect[] = [
            { ...rect, width: rect.width + 1 },
            { ...rect, height: rect.height + 1 },
            { ...rect, x: rect.x - 1, width: rect.width + 1 },
            { ...rect, y: rect.y - 1, height: rect.height + 1 },
          ];
          for (const candidate of grown) {
            const fits =
              isInside(candidate, shape) && isRectCovered(spans, candidate);
            expect(fits).toBe(false);
          }
        },
      ),
    );
  });
});
