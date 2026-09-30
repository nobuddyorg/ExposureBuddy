import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  ALIGNMENT_LONG_EDGE,
  DEFAULT_BUDGET_BYTES,
  FRAME_BYTES_PER_PIXEL,
  MIN_LONG_EDGE,
  RENDER_BYTES_PER_PIXEL,
  STACKING_OVERHEAD_BYTES_PER_PIXEL,
  chooseWorkingSize,
  peakBytesPerPixel,
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
    });
    expect(working).toEqual({ width: 1600, height: 1200, scale: 1600 / 4032 });
  });

  it('shrinks below the output size when the frames would not fit the budget', () => {
    // 35 B/px (10 × 3 + 5 outranks the render floor of 34) × w × h ≤ 26.25 MiB → w × h ≤ 786 432 → 1024 × 768 at 4:3 exactly.
    const working = chooseWorkingSize({
      source: PHONE,
      frameCount: 10,
      budgetBytes: 26.25 * 1024 * 1024,
      maxLongEdge: 2400,
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
    });
    expect(working).toEqual({ width: 640, height: 480, scale: 1 });
  });

  it('respects a portrait source', () => {
    const working = chooseWorkingSize({
      source: { width: 3024, height: 4032 },
      frameCount: 5,
      budgetBytes: DEFAULT_BUDGET_BYTES,
      maxLongEdge: 1024,
    });
    expect(working).toEqual({ width: 768, height: 1024, scale: 768 / 3024 });
  });

  it('stops at MIN_LONG_EDGE when only the budget asks for less', () => {
    const working = chooseWorkingSize({
      source: PHONE,
      frameCount: 500,
      budgetBytes: 8 * 1024 * 1024,
      maxLongEdge: 1600,
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
    });
    expect(tiny.width).toBe(320);
    const small = chooseWorkingSize({
      source: { width: 200, height: 100 },
      frameCount: 500,
      budgetBytes: 1024,
      maxLongEdge: 1600,
    });
    expect(small).toEqual({ width: 200, height: 100, scale: 1 });
  });

  it('rounds down to even numbers and never below 2', () => {
    const odd = chooseWorkingSize({
      source: { width: 1001, height: 751 },
      frameCount: 1,
      budgetBytes: DEFAULT_BUDGET_BYTES,
      maxLongEdge: 2400,
    });
    expect(odd).toEqual({ width: 1000, height: 750, scale: 1000 / 1001 });
    const sliver = chooseWorkingSize({
      source: { width: 4000, height: 3 },
      frameCount: 1,
      budgetBytes: DEFAULT_BUDGET_BYTES,
      maxLongEdge: 1024,
    });
    expect(sliver).toEqual({ width: 1024, height: 2, scale: 1024 / 4000 });
  });

  it('fits the budget or the floor, keeps the aspect and never upscales, whatever the input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8000 }),
        fc.integer({ min: 2, max: 8000 }),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 1, max: 512 }),
        fc.constantFrom(1024, 1600, 2400),
        (width, height, frameCount, budgetMebibytes, maxLongEdge) => {
          const source = { width, height };
          const budgetBytes = budgetMebibytes * 1024 * 1024;
          const working = chooseWorkingSize({
            source,
            frameCount,
            budgetBytes,
            maxLongEdge,
          });
          expect(working.width % 2).toBe(0);
          expect(working.height % 2).toBe(0);
          expect(working.width).toBeLessThanOrEqual(Math.max(2, width));
          expect(working.height).toBeLessThanOrEqual(Math.max(2, height));
          expect(working.scale).toBe(working.width / width);
          const longEdge = Math.max(working.width, working.height);
          expect(longEdge).toBeLessThanOrEqual(Math.max(2, maxLongEdge));
          const bytes =
            peakBytesPerPixel(frameCount) * working.width * working.height;
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

describe('peakBytesPerPixel', () => {
  it('is the render floor for a small burst and the frames plus the stacking overhead for a large one', () => {
    expect(peakBytesPerPixel(9)).toBe(RENDER_BYTES_PER_PIXEL);
    expect(peakBytesPerPixel(10)).toBe(10 * FRAME_BYTES_PER_PIXEL + 5);
    expect(peakBytesPerPixel(50)).toBe(
      50 * FRAME_BYTES_PER_PIXEL + STACKING_OVERHEAD_BYTES_PER_PIXEL,
    );
  });

  it('counts three bytes per frame and 34 for rendering', () => {
    expect(FRAME_BYTES_PER_PIXEL).toBe(3);
    expect(RENDER_BYTES_PER_PIXEL).toBe(34);
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
