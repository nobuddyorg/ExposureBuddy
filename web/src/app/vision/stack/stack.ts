import { ROBUST_MODE_COUNT, robustBackgrounds } from './backgrounds';
import type { AlignedFrame, Rect, Size, StackResult } from '../types';

const CHANNELS = 4;
const OPAQUE = 255;
const PROGRESS_STEP = 0.02;

/** Returns per-pixel median, mean, deviation and coverage count over the frames covering each pixel; throws when the frames differ in size. */
export function stackFrames(
  frames: readonly AlignedFrame[],
  options: { readonly onProgress?: (fraction: number) => void } = {},
): StackResult {
  const { width, height } = requireOneSize(frames);
  const frameCount = frames.length;
  const frameData = frames.map((frame) => frame.image.data);
  const frameCoverage = frames.map((frame) => frame.coverage);
  const pixelCount = width * height;
  const median = new Uint8ClampedArray(pixelCount * CHANNELS);
  const trimmed = new Uint8ClampedArray(pixelCount * CHANNELS);
  const clipped = new Uint8ClampedArray(pixelCount * CHANNELS);
  const densest = new Uint8ClampedArray(pixelCount * CHANNELS);
  const mean = new Uint8ClampedArray(pixelCount * CHANNELS);
  const deviation = new Uint8Array(pixelCount);
  const coverage = new Uint8Array(pixelCount);
  const red = new Uint8Array(frameCount);
  const green = new Uint8Array(frameCount);
  const blue = new Uint8Array(frameCount);
  const scratch = new Uint8Array(frameCount);
  const estimates = new Uint8Array(ROBUST_MODE_COUNT);
  const storeRobust = (
    values: Uint8Array,
    count: number,
    median: number,
    target: number,
  ): void => {
    robustBackgrounds({ values, count, median }, scratch, estimates);
    trimmed[target] = estimates[0];
    clipped[target] = estimates[1];
    densest[target] = estimates[2];
  };
  const report = options.onProgress ?? noProgress;
  let reported = 0;
  let pixel = 0;
  while (pixel < pixelCount) {
    const rowEnd = pixel + width;
    for (; pixel < rowEnd; pixel += 1) {
      const offset = pixel * CHANNELS;
      let count = 0;
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;
      for (let frame = 0; frame < frameCount; frame += 1) {
        if (frameCoverage[frame][pixel] !== 1) continue;
        const data = frameData[frame];
        red[count] = data[offset];
        green[count] = data[offset + 1];
        blue[count] = data[offset + 2];
        redSum += red[count];
        greenSum += green[count];
        blueSum += blue[count];
        count += 1;
      }
      coverage[pixel] = count;
      if (count === 0) continue;
      const redMedian = selectMedian(red, count);
      const greenMedian = selectMedian(green, count);
      const blueMedian = selectMedian(blue, count);
      median[offset] = redMedian;
      median[offset + 1] = greenMedian;
      median[offset + 2] = blueMedian;
      median[offset + 3] = OPAQUE;
      trimmed[offset + 3] = OPAQUE;
      clipped[offset + 3] = OPAQUE;
      densest[offset + 3] = OPAQUE;
      mean[offset] = Math.round(redSum / count);
      mean[offset + 1] = Math.round(greenSum / count);
      mean[offset + 2] = Math.round(blueSum / count);
      mean[offset + 3] = OPAQUE;
      storeRobust(red, count, redMedian, offset);
      storeRobust(green, count, greenMedian, offset + 1);
      storeRobust(blue, count, blueMedian, offset + 2);
      const spread = Math.max(
        meanAbsoluteDeviation(red, count, redMedian),
        meanAbsoluteDeviation(green, count, greenMedian),
        meanAbsoluteDeviation(blue, count, blueMedian),
      );
      deviation[pixel] = Math.min(OPAQUE, Math.round(spread));
    }
    const fraction = pixel / pixelCount;
    if (fraction === 1 || fraction - reported >= PROGRESS_STEP) {
      reported = fraction;
      report(fraction);
    }
  }
  const backgrounds = { median, trimmed, clipped, mode: densest };
  return {
    width,
    height,
    median,
    backgrounds,
    mean,
    deviation,
    coverage,
    frameCount,
  };
}

function noProgress(): void {}

function requireOneSize(frames: readonly AlignedFrame[]): Size {
  if (frames.length === 0)
    throw new Error('stackFrames needs at least one frame.');
  const { width, height } = frames[0].image;
  const mismatched = frames.some(
    (frame) =>
      frame.image.width !== width ||
      frame.image.height !== height ||
      frame.coverage.length !== width * height,
  );
  if (mismatched)
    throw new Error('stackFrames: every frame must share one size.');
  return { width, height };
}

/** Returns the rounded median of `values[0, count)`, permuting them; an even count averages the two middle values. */
export function selectMedian(values: Uint8Array, count: number): number {
  const lowerMiddle = (count - 1) >> 1;
  quickselect(values, count, lowerMiddle);
  const lower = values[lowerMiddle];
  if (count % 2 === 1) return lower;
  let upper = OPAQUE;
  for (let index = lowerMiddle + 1; index < count; index += 1) {
    upper = Math.min(upper, values[index]);
  }
  return Math.round((lower + upper) / 2);
}

// Hoare quickselect: afterwards values[k] is the k-th smallest and every value at an index above k is at least as large.
function quickselect(values: Uint8Array, count: number, k: number): void {
  let left = 0;
  let right = count - 1;
  while (left < right) {
    const pivot = values[(left + right) >> 1];
    let i = left;
    let j = right;
    while (i <= j) {
      while (values[i] < pivot) i += 1;
      while (values[j] > pivot) j -= 1;
      if (i <= j) {
        const swapped = values[i];
        values[i] = values[j];
        values[j] = swapped;
        i += 1;
        j -= 1;
      }
    }
    // Keep the side holding k; when k sits between j and i it already holds the pivot and both moves empty the window.
    if (j < k) left = i;
    if (k < i) right = j;
  }
}

function meanAbsoluteDeviation(
  values: Uint8Array,
  count: number,
  center: number,
): number {
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    sum += Math.abs(values[index] - center);
  }
  return sum / count;
}

const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** Returns the largest-area axis-aligned rectangle whose cells all have `coverage` ≥ `required` (exclusive far edges); a zero rect when none. */
export function fullCoverageRect(
  coverage: Uint8Array,
  size: Size,
  required: number,
): Rect {
  const { width } = size;
  // One closing bar of height 0 after the last column, so every run of bars ends inside the histogram.
  const heights = new Int32Array(width + 1);
  const stack = new Int32Array(width + 2);
  let best = EMPTY_RECT;
  let x = 0;
  let y = 0;
  for (const count of coverage) {
    heights[x] = count >= required ? heights[x] + 1 : 0;
    x += 1;
    if (x === width) {
      best = largerRect(best, widestRectOnRow(heights, stack, y));
      x = 0;
      y += 1;
    }
  }
  return best;
}

// Largest rectangle under the histogram `heights`, bottom edge on row `y`; `stack` holds column indices with increasing heights.
function widestRectOnRow(
  heights: Int32Array,
  stack: Int32Array,
  y: number,
): Rect {
  let best = EMPTY_RECT;
  let top = 0;
  heights.forEach((currentHeight, x) => {
    while (top > 0) {
      const barHeight = heights[stack[top - 1]];
      if (barHeight < currentHeight) break;
      top -= 1;
      const left = top > 0 ? stack[top - 1] + 1 : 0;
      best = largerRect(best, {
        x: left,
        y: y - barHeight + 1,
        width: x - left,
        height: barHeight,
      });
    }
    stack[top] = x;
    top += 1;
  });
  return best;
}

function largerRect(current: Rect, candidate: Rect): Rect {
  return candidate.width * candidate.height > current.width * current.height
    ? candidate
    : current;
}
