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
  chooseWorkingSize,
  estimateOutput,
  qualityLongEdge,
  workerPoolSize,
} from './budget';

const PHONE = { width: 4032, height: 3024 };

describe('qualityLongEdge', () => {
  it('maps the three qualities to their long edges', () => {
    expect(qualityLongEdge('low')).toBe(1024);
    expect(qualityLongEdge('standard')).toBe(1600);
    expect(qualityLongEdge('high')).toBe(2400);
    expect(ALIGNMENT_LONG_EDGE).toBe(960);
    expect(DEFAULT_BUDGET_BYTES).toBe(256 * 1024 * 1024);
  });
});

describe('chooseWorkingSize', () => {
  it('caps the long edge at the requested output size when the budget is generous', () => {
    const working = chooseWorkingSize({
      source: PHONE,
      frameCount: 10,
      budgetBytes: DEFAULT_BUDGET_BYTES,
      maxLongEdge: 1600,
      requestedWorkers: 1,
    });
    expect(working).toEqual({
      width: 1600,
      height: 1200,
      scale: 1600 / 4032,
      alignWorkers: 1,
    });
  });

  it('shrinks below the output size when the frames would not fit the budget', () => {
    // One worker: its full-size decode (12 192 768 px × 6) plus 43 B/px (10 × 3 + 5 + 8) × 1024 × 768 is exactly this budget.
    const working = chooseWorkingSize({
      source: PHONE,
      frameCount: 10,
      budgetBytes: 12_192_768 * 6 + 43 * 1024 * 768,
      maxLongEdge: 2400,
      requestedWorkers: 1,
    });
    expect(working.width).toBe(1024);
    expect(working.height).toBe(768);
    expect(working.scale).toBeCloseTo(1024 / 4032, 9);
  });

  it('never upscales a small source', () => {
    const working = chooseWorkingSize({
      source: { width: 640, height: 480 },
      frameCount: 3,
      budgetBytes: DEFAULT_BUDGET_BYTES,
      maxLongEdge: 2400,
      requestedWorkers: 1,
    });
    expect(working).toEqual({
      width: 640,
      height: 480,
      scale: 1,
      alignWorkers: 1,
    });
  });

  it('respects a portrait source', () => {
    const working = chooseWorkingSize({
      source: { width: 3024, height: 4032 },
      frameCount: 5,
      budgetBytes: DEFAULT_BUDGET_BYTES,
      maxLongEdge: 1024,
      requestedWorkers: 1,
    });
    expect(working).toEqual({
      width: 768,
      height: 1024,
      scale: 768 / 3024,
      alignWorkers: 1,
    });
  });

  it('stops at MIN_LONG_EDGE when only the budget asks for less', () => {
    const working = chooseWorkingSize({
      source: PHONE,
      frameCount: 500,
      budgetBytes: 8 * 1024 * 1024,
      maxLongEdge: 1600,
      requestedWorkers: 1,
    });
    expect(working.width).toBe(MIN_LONG_EDGE);
    expect(working.height).toBe(480);
  });

  it('still honours maxLongEdge and the source below MIN_LONG_EDGE', () => {
    const tiny = chooseWorkingSize({
      source: PHONE,
      frameCount: 500,
      budgetBytes: 1024,
      maxLongEdge: 320,
      requestedWorkers: 1,
    });
    expect(tiny.width).toBe(320);
    const small = chooseWorkingSize({
      source: { width: 200, height: 100 },
      frameCount: 500,
      budgetBytes: 1024,
      maxLongEdge: 1600,
      requestedWorkers: 1,
    });
    expect(small).toEqual({
      width: 200,
      height: 100,
      scale: 1,
      alignWorkers: 1,
    });
  });

  it('rounds down to even numbers and never below 2', () => {
    const odd = chooseWorkingSize({
      source: { width: 1001, height: 751 },
      frameCount: 1,
      budgetBytes: DEFAULT_BUDGET_BYTES,
      maxLongEdge: 2400,
      requestedWorkers: 1,
    });
    expect(odd).toEqual({
      width: 1000,
      height: 750,
      scale: 1000 / 1001,
      alignWorkers: 1,
    });
    const sliver = chooseWorkingSize({
      source: { width: 4000, height: 3 },
      frameCount: 1,
      budgetBytes: DEFAULT_BUDGET_BYTES,
      maxLongEdge: 1024,
      requestedWorkers: 1,
    });
    expect(sliver).toEqual({
      width: 1024,
      height: 2,
      scale: 1024 / 4000,
      alignWorkers: 1,
    });
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
          const longEdge = Math.max(working.width, working.height);
          expect(longEdge).toBeLessThanOrEqual(Math.max(2, maxLongEdge));
          const pixels = working.width * working.height;
          const bytes = Math.max(
            pixels * aligningBytesPerPixel(frameCount, working.alignWorkers) +
              working.alignWorkers * width * height * 6,
            pixels * RENDER_BYTES_PER_PIXEL,
          );
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

describe('aligningBytesPerPixel', () => {
  it('adds three bytes per frame, the stacking overhead and eight per align worker', () => {
    expect(aligningBytesPerPixel(10, 1)).toBe(10 * 3 + 5 + 8);
    expect(aligningBytesPerPixel(50, 4)).toBe(
      50 * FRAME_BYTES_PER_PIXEL +
        STACKING_OVERHEAD_BYTES_PER_PIXEL +
        4 * ALIGN_BYTES_PER_WORKING_PIXEL,
    );
  });

  it('counts three bytes per frame, 34 for rendering and 6 per source pixel for a decode', () => {
    expect(FRAME_BYTES_PER_PIXEL).toBe(3);
    expect(RENDER_BYTES_PER_PIXEL).toBe(34);
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
    const plan = chooseWorkingSize({
      source: PHONE,
      frameCount: 80,
      budgetBytes,
      maxLongEdge: 2400,
      requestedWorkers: 4,
    });
    expect(plan.alignWorkers).toBe(2);
    const decodes = 2 * 12_192_768 * 6;
    const peak = (pixels: number) =>
      pixels * aligningBytesPerPixel(80, 2) + decodes;
    expect(Math.max(plan.width, plan.height)).toBeLessThan(2400);
    expect(peak(plan.width * plan.height)).toBeLessThanOrEqual(budgetBytes);
    // Two more pixels on each side would no longer fit.
    expect(peak((plan.width + 2) * (plan.height + 2))).toBeGreaterThan(
      budgetBytes,
    );
  });

  it('falls to the floor, not below it, when one decode alone exceeds the budget', () => {
    const plan = chooseWorkingSize({
      source: { width: 8000, height: 6000 },
      frameCount: 10,
      budgetBytes: 64 * 1024 * 1024,
      maxLongEdge: 2400,
      requestedWorkers: 2,
    });
    expect(plan).toEqual({
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
    ).toEqual({ width: 1600, height: 1200, limited: false });
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
    ).toEqual({ width: 1200, height: 900, limited: false });
  });

  it('measures the limit against the photo’s long side', () => {
    const estimate = estimateOutput({
      source: { width: 2000, height: 1000 },
      frameCount: 1,
      budgetBytes: 34 * 1500 * 750,
      quality: 'high',
      requestedWorkers: 1,
    });
    expect(estimate).toEqual({ width: 1500, height: 750, limited: true });
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
    // For one frame rendering is the peak, 34 B/px: these budgets give 1598 and 1596 px after even rounding.
    expect(at(34 * 1599 * 1599)).toMatchObject({ width: 1598, limited: false });
    expect(at(34 * 1597 * 1597)).toMatchObject({ width: 1596, limited: true });
  });
});
