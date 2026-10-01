import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ALIGNMENT_LONG_EDGE,
  DEFAULT_BUDGET_BYTES,
  FRAME_BYTES_PER_PIXEL,
  MIN_LONG_EDGE,
  RENDER_BYTES_PER_PIXEL,
  STACKING_OVERHEAD_BYTES_PER_PIXEL,
  ALIGN_BYTES_PER_WORKING_PIXEL,
  DECODE_BYTES_PER_SOURCE_PIXEL,
  aligningBytesPerPixel,
  alignWorkersFor,
  MAX_PASSES,
  MAX_WORKING_PIXELS,
  chooseWorkingSize,
  estimateOutput,
  peakBytes,
  stripRanges,
  stripRowsFor,
  qualityLongEdge,
  workerPoolSize,
} from './budget';

const PHONE = { width: 4032, height: 3024 };

describe('qualityLongEdge', () => {
  it('maps the qualities to their long edges, the original to no limit', () => {
    expect(qualityLongEdge('low')).toBe(1024);
    expect(qualityLongEdge('standard')).toBe(1600);
    expect(qualityLongEdge('high')).toBe(2400);
    expect(qualityLongEdge('original')).toBe(Number.POSITIVE_INFINITY);
    expect(ALIGNMENT_LONG_EDGE).toBe(960);
    expect(DEFAULT_BUDGET_BYTES).toBe(256 * 1024 * 1024);
  });
});

/** The plan for a 12 MP phone photo with one requested worker; `overrides` change the rest. */
function plan(overrides: Partial<Parameters<typeof chooseWorkingSize>[0]>) {
  return chooseWorkingSize({
    source: PHONE,
    frameCount: 10,
    budgetBytes: DEFAULT_BUDGET_BYTES,
    maxLongEdge: 1600,
    requestedWorkers: 1,
    ...overrides,
  });
}

describe('chooseWorkingSize', () => {
  it('caps the long edge at the requested output size, in one pass, when the budget is generous', () => {
    expect(plan({})).toEqual({
      width: 1600,
      height: 1200,
      scale: 1600 / 4032,
      alignWorkers: 1,
      stripRows: 1200,
      passes: 1,
    });
  });

  it('splits the rows into the fewest strips that fit rather than shrink', () => {
    // 40 frames at 2400 × 1800 need 648 MB in one pass; in two strips of 960 rows, 480 MB fits 512 MiB.
    expect(
      plan({
        frameCount: 40,
        budgetBytes: 512 * 1024 * 1024,
        maxLongEdge: 2400,
      }),
    ).toMatchObject({ width: 2400, height: 1800, stripRows: 960, passes: 2 });
  });

  it('shrinks only when even the most strips do not fit, to the largest size that does', () => {
    const budgetBytes = 200 * 1024 * 1024;
    const shrunk = plan({ frameCount: 60, budgetBytes, maxLongEdge: 2400 });
    expect(shrunk.width).toBeLessThan(2400);
    const peak = (size: { width: number; height: number }, passes: number) =>
      peakBytes({
        source: PHONE,
        frameCount: 60,
        budgetBytes,
        size,
        alignWorkers: 1,
        passes,
      });
    expect(peak(shrunk, shrunk.passes)).toBeLessThanOrEqual(budgetBytes);
    const larger = {
      width: shrunk.width + 4,
      height: Math.floor(((shrunk.width + 4) * 3) / 8) * 2,
    };
    for (let passes = 1; passes <= MAX_PASSES; passes += 1)
      expect(peak(larger, passes)).toBeGreaterThan(budgetBytes);
  });

  it('never upscales a small source', () => {
    expect(
      plan({
        source: { width: 640, height: 480 },
        frameCount: 3,
        maxLongEdge: 2400,
      }),
    ).toMatchObject({ width: 640, height: 480, scale: 1, passes: 1 });
  });

  it('respects a portrait source', () => {
    expect(
      plan({ source: { width: 3024, height: 4032 }, maxLongEdge: 1024 }),
    ).toMatchObject({ width: 768, height: 1024, scale: 768 / 3024 });
  });

  it('stops at MIN_LONG_EDGE in the most passes when only the budget asks for less', () => {
    expect(
      plan({ frameCount: 500, budgetBytes: 8 * 1024 * 1024 }),
    ).toMatchObject({
      width: MIN_LONG_EDGE,
      height: 480,
      stripRows: 64,
      passes: MAX_PASSES,
    });
  });

  it('still honours maxLongEdge and the source below MIN_LONG_EDGE', () => {
    expect(
      plan({ frameCount: 500, budgetBytes: 1024, maxLongEdge: 320 }).width,
    ).toBe(320);
    expect(
      plan({
        source: { width: 200, height: 100 },
        frameCount: 500,
        budgetBytes: 1024,
      }),
    ).toMatchObject({ width: 200, height: 100, scale: 1 });
  });

  it('rounds down to even numbers and never below 2', () => {
    expect(
      plan({
        source: { width: 1001, height: 751 },
        frameCount: 1,
        maxLongEdge: 2400,
      }),
    ).toMatchObject({ width: 1000, height: 750, scale: 1000 / 1001 });
    expect(
      plan({
        source: { width: 4000, height: 3 },
        frameCount: 1,
        maxLongEdge: 1024,
      }),
    ).toMatchObject({ width: 1024, height: 2, scale: 1024 / 4000 });
  });

  it('takes the original size up to the largest canvas every engine draws', () => {
    expect(
      plan({ maxLongEdge: qualityLongEdge('original'), budgetBytes: 2 ** 31 }),
    ).toMatchObject({ width: 4032, height: 3024, scale: 1 });
    const huge = plan({
      source: { width: 8000, height: 6000 },
      maxLongEdge: qualityLongEdge('original'),
      budgetBytes: 2 ** 31,
    });
    expect(huge.width * huge.height).toBeLessThanOrEqual(MAX_WORKING_PIXELS);
    expect(huge.width).toBeGreaterThan(4700);
  });

  it('fits the budget or the floor, keeps the aspect and never upscales, whatever the input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8000 }),
        fc.integer({ min: 2, max: 8000 }),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 512 }),
        fc.constantFrom(1024, 1600, 2400),
        fc.integer({ min: 1, max: 4 }),
        (
          width,
          height,
          frameCount,
          budgetMebibytes,
          maxLongEdge,
          requestedWorkers,
        ) => {
          const source = { width, height };
          const budgetBytes = budgetMebibytes * 1024 * 1024;
          const working = chooseWorkingSize({
            source,
            frameCount,
            budgetBytes,
            maxLongEdge,
            requestedWorkers,
          });
          expect(working.width % 2).toBe(0);
          expect(working.height % 2).toBe(0);
          expect(working.width).toBeLessThanOrEqual(Math.max(2, width));
          expect(working.height).toBeLessThanOrEqual(Math.max(2, height));
          expect(working.scale).toBe(working.width / width);
          expect(working.passes).toBeGreaterThanOrEqual(1);
          expect(working.passes).toBeLessThanOrEqual(MAX_PASSES);
          expect(working.stripRows * working.passes).toBeGreaterThanOrEqual(
            working.height,
          );
          const longEdge = Math.max(working.width, working.height);
          expect(longEdge).toBeLessThanOrEqual(Math.max(2, maxLongEdge));
          const bytes = peakBytes({
            source,
            frameCount,
            budgetBytes,
            size: working,
            alignWorkers: working.alignWorkers,
            passes: working.passes,
          });
          const atFloor = longEdge <= Math.max(2, MIN_LONG_EDGE);
          expect(bytes <= budgetBytes || atFloor).toBe(true);
          const aspect = width / height;
          const workingAspect = working.width / working.height;
          if (working.width > 20 && working.height > 20) {
            expect(Math.abs(workingAspect - aspect) / aspect).toBeLessThan(
              0.15,
            );
          }
        },
      ),
    );
  });
});

describe('stripRowsFor', () => {
  it('splits the rows evenly, rounded up to whole bands', () => {
    expect(stripRowsFor(1800, 2)).toBe(960);
    expect(stripRowsFor(1800, 8)).toBe(256);
    expect(stripRowsFor(100, 8)).toBe(64);
    expect(stripRowsFor(128, 2)).toBe(64);
  });
});

describe('stripRanges', () => {
  it('runs from the top in strips to the crop’s last row', () => {
    expect(stripRanges({ x: 0, y: 10, width: 5, height: 180 }, 64)).toEqual([
      { start: 0, end: 64 },
      { start: 64, end: 128 },
      { start: 128, end: 190 },
    ]);
  });

  it('is one range when the crop ends within the first strip', () => {
    expect(stripRanges({ x: 0, y: 3, width: 5, height: 40 }, 64)).toEqual([
      { start: 0, end: 43 },
    ]);
  });
});

describe('peakBytes', () => {
  const base = {
    source: { width: 1000, height: 1000 },
    frameCount: 10,
    budgetBytes: 0,
    size: { width: 500, height: 640 },
    alignWorkers: 2,
  };
  const decodes = 2 * 1000 * 1000 * 6;
  const pixels = 500 * 640;

  it('holds every frame whole in one pass', () => {
    expect(peakBytes({ ...base, passes: 1 })).toBe(
      pixels * (10 * 3 + 5 + 2 * 8) + decodes,
    );
  });

  it('holds one strip of every frame and of each worker in flight over strips', () => {
    expect(peakBytes({ ...base, passes: 5 })).toBe(
      pixels * (24 + 2 * 8) + (10 + 2) * 3 * 128 * 500 + decodes,
    );
  });

  it('is at least what rendering holds', () => {
    expect(
      peakBytes({ ...base, frameCount: 1, alignWorkers: 0, passes: 1 }),
    ).toBe(pixels * 37);
    expect(
      peakBytes({ ...base, frameCount: 1, alignWorkers: 0, passes: 8 }),
    ).toBe(pixels * 37);
  });
});

describe('aligningBytesPerPixel', () => {
  it('adds three bytes per frame, the stacking overhead and eight per align worker', () => {
    expect(aligningBytesPerPixel(10, 1)).toBe(10 * 3 + 5 + 8);
    expect(aligningBytesPerPixel(50, 4)).toBe(
      50 * FRAME_BYTES_PER_PIXEL +
        STACKING_OVERHEAD_BYTES_PER_PIXEL +
        4 * ALIGN_BYTES_PER_WORKING_PIXEL,
    );
  });

  it('counts three bytes per frame, 37 for rendering and 6 per source pixel for a decode', () => {
    expect(FRAME_BYTES_PER_PIXEL).toBe(3);
    expect(RENDER_BYTES_PER_PIXEL).toBe(37);
    expect(DECODE_BYTES_PER_SOURCE_PIXEL).toBe(6);
  });
});

describe('alignWorkersFor', () => {
  // A 12 MP decode is 12 192 768 × 6 = 73 156 608 bytes; a quarter of the budget pays for this many.
  it('runs as many workers as a quarter of the budget pays full-size decodes for', () => {
    const budget = (bytes: number) =>
      alignWorkersFor({
        source: PHONE,
        requestedWorkers: 4,
        budgetBytes: bytes,
      });
    expect(budget(4 * 73_156_608 * 3)).toBe(3);
    expect(budget(4 * 73_156_608 * 3 - 1)).toBe(2);
    expect(budget(2 * 1024 * 1024 * 1024)).toBe(4);
  });

  it('never runs more than asked for, nor fewer than one', () => {
    expect(
      alignWorkersFor({
        source: { width: 100, height: 100 },
        requestedWorkers: 2,
        budgetBytes: DEFAULT_BUDGET_BYTES,
      }),
    ).toBe(2);
    expect(
      alignWorkersFor({
        source: PHONE,
        requestedWorkers: 4,
        budgetBytes: 1024,
      }),
    ).toBe(1);
  });
});

describe('chooseWorkingSize with workers', () => {
  it('plans the workers it sized for and leaves room for their decodes', () => {
    const budgetBytes = 768 * 1024 * 1024;
    const planned = chooseWorkingSize({
      source: PHONE,
      frameCount: 80,
      budgetBytes,
      maxLongEdge: 2400,
      requestedWorkers: 4,
    });
    expect(planned.alignWorkers).toBe(2);
    expect(
      peakBytes({
        source: PHONE,
        frameCount: 80,
        budgetBytes,
        size: planned,
        alignWorkers: 2,
        passes: planned.passes,
      }),
    ).toBeLessThanOrEqual(budgetBytes);
    // Without the two decodes there would be room for fewer passes.
    expect(planned.passes).toBeGreaterThan(1);
  });

  it('falls to the floor, not below it, when one decode alone exceeds the budget', () => {
    const plan = chooseWorkingSize({
      source: { width: 8000, height: 6000 },
      frameCount: 10,
      budgetBytes: 64 * 1024 * 1024,
      maxLongEdge: 2400,
      requestedWorkers: 2,
    });
    expect(plan).toMatchObject({
      width: MIN_LONG_EDGE,
      height: 480,
      scale: MIN_LONG_EDGE / 8000,
      alignWorkers: 1,
    });
  });
});

describe('workerPoolSize', () => {
  it('leaves one core for the main thread and stays within [1, 4]', () => {
    expect(workerPoolSize(1)).toBe(1);
    expect(workerPoolSize(2)).toBe(1);
    expect(workerPoolSize(4)).toBe(3);
    expect(workerPoolSize(5)).toBe(4);
    expect(workerPoolSize(16)).toBe(4);
  });

  it('assumes two workers when the core count is unknown', () => {
    expect(workerPoolSize(undefined)).toBe(2);
  });
});

describe('estimateOutput', () => {
  it('is the planned working size, not limited when the chosen size is reached', () => {
    expect(
      estimateOutput({
        source: PHONE,
        frameCount: 5,
        budgetBytes: DEFAULT_BUDGET_BYTES,
        quality: 'standard',
        requestedWorkers: 1,
      }),
    ).toEqual({ width: 1600, height: 1200, limited: false, passes: 1 });
  });

  it('is not limited by a photo smaller than the chosen size', () => {
    expect(
      estimateOutput({
        source: { width: 1201, height: 900 },
        frameCount: 5,
        budgetBytes: DEFAULT_BUDGET_BYTES,
        quality: 'high',
        requestedWorkers: 1,
      }),
    ).toEqual({ width: 1200, height: 900, limited: false, passes: 1 });
  });

  it('is not limited by the largest canvas, only by memory', () => {
    const huge = (budgetBytes: number) =>
      estimateOutput({
        source: { width: 8000, height: 6000 },
        frameCount: 5,
        budgetBytes,
        quality: 'original',
        requestedWorkers: 1,
      });
    const roomy = huge(2 ** 31);
    expect(roomy.width * roomy.height).toBeLessThanOrEqual(MAX_WORKING_PIXELS);
    expect(roomy.limited).toBe(false);
    expect(huge(256 * 1024 * 1024).limited).toBe(true);
  });

  it('measures the limit against the photo’s long side', () => {
    const estimate = estimateOutput({
      source: { width: 2000, height: 1000 },
      frameCount: 1,
      budgetBytes: 37 * 1500 * 750,
      quality: 'high',
      requestedWorkers: 1,
    });
    expect(estimate).toMatchObject({ width: 1500, height: 750, limited: true });
  });

  it('is limited when memory takes more than the even rounding', () => {
    const estimate = estimateOutput({
      source: PHONE,
      frameCount: 60,
      budgetBytes: DEFAULT_BUDGET_BYTES,
      quality: 'high',
      requestedWorkers: 1,
    });
    expect(estimate.limited).toBe(true);
    expect(estimate.width).toBeLessThan(2400);
  });

  it('allows the two pixels even rounding can cost, and no more', () => {
    const at = (budgetBytes: number) =>
      estimateOutput({
        source: { width: 2000, height: 2000 },
        frameCount: 1,
        budgetBytes,
        quality: 'standard',
        requestedWorkers: 1,
      });
    // For one frame rendering is the peak, 37 B/px: these budgets give 1598 and 1596 px after even rounding.
    expect(at(37 * 1599 * 1599)).toMatchObject({ width: 1598, limited: false });
    expect(at(37 * 1597 * 1597)).toMatchObject({ width: 1596, limited: true });
  });
});
