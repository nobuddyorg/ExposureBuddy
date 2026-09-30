import {
  allocateBand,
  emptyBandedRgb,
  releaseBandsAbove,
  rowOf,
} from '../image/banded';
import type {
  AlignedFrame,
  Rect,
  RowRange,
  RowSpans,
  Size,
  StackResult,
} from '../types';
import { indices } from '../indices';
import { ROBUST_MODE_COUNT, robustBackgrounds } from './backgrounds';

const RGB = 3;
const OPAQUE = 255;
const PROGRESS_STEP = 0.02;

/** An empty result the size of `rect`: every layer's bands unallocated until stackRows reaches them. */
export function emptyStack(rect: Rect, frameCount: number): StackResult {
  return {
    width: rect.width,
    height: rect.height,
    backgrounds: {
      median: emptyBandedRgb(rect),
      trimmed: emptyBandedRgb(rect),
      clipped: emptyBandedRgb(rect),
      mode: emptyBandedRgb(rect),
    },
    mean: emptyBandedRgb(rect),
    frameCount,
  };
}

interface StackRowsOptions {
  /** The crop every frame covers entirely (see fullCoverageRect); `stack` is its size. */
  readonly rect: Rect;
  /** Which rows of the frames to stack; the part inside `rect` is. */
  readonly rows: RowRange;
  readonly onProgress?: (fraction: number) => void;
}

/**
 * Writes, for every pixel of `rows` inside `rect`, the four background estimates and the mean over all frames into `stack`.
 * Consumes the frames: each band is freed once its rows are stacked, so the peak stays near one copy of the burst.
 */
export function stackRows(
  frames: readonly AlignedFrame[],
  stack: StackResult,
  { rect, rows, onProgress = noProgress }: StackRowsOptions,
): void {
  if (frames.length === 0)
    throw new Error('stackRows needs at least one frame.');
  const frameCount = frames.length;
  const { mean, backgrounds } = stack;
  const layers = [
    backgrounds.median,
    backgrounds.trimmed,
    backgrounds.clipped,
    backgrounds.mode,
    mean,
  ];
  const red = new Uint8Array(frameCount);
  const green = new Uint8Array(frameCount);
  const blue = new Uint8Array(frameCount);
  const channels = [red, green, blue];
  const scratch = new Uint8Array(frameCount);
  const estimates = new Uint8Array(ROBUST_MODE_COUNT);
  const { bandRows } = mean;
  const columns = indices(rect.width);
  const first = Math.max(rows.start, rect.y) - rect.y;
  const last = Math.min(rows.end, rect.y + rect.height) - rect.y;
  let reported = 0;
  for (let chunkStart = first; chunkStart < last;) {
    const band = Math.floor(chunkStart / bandRows);
    const chunkEnd = Math.min((band + 1) * bandRows, last);
    // A band that straddles two strips already holds the first strip's rows.
    layers.forEach((layer) => {
      if (layer.bands[band].length === 0) allocateBand(layer, band);
    });
    for (let y = chunkStart; y < chunkEnd; y += 1) {
      const sourceRows = frames.map((frame) => rowOf(frame.image, rect.y + y));
      const [medianRow, trimmedRow, clippedRow, modeRow, meanRow] = layers.map(
        (layer) => rowOf(layer, y),
      );
      for (const x of columns) {
        const source = (rect.x + x) * RGB;
        const target = x * RGB;
        for (let channel = 0; channel < RGB; channel += 1) {
          const values = channels[channel];
          let sum = 0;
          for (let frame = 0; frame < frameCount; frame += 1) {
            values[frame] = sourceRows[frame][source + channel];
            sum += values[frame];
          }
          const median = selectMedian(values, frameCount);
          medianRow[target + channel] = median;
          meanRow[target + channel] = Math.round(sum / frameCount);
          robustBackgrounds(
            { values, count: frameCount, median },
            scratch,
            estimates,
          );
          trimmedRow[target + channel] = estimates[0];
          clippedRow[target + channel] = estimates[1];
          modeRow[target + channel] = estimates[2];
        }
      }
    }
    frames.forEach((frame) =>
      releaseBandsAbove(frame.image, rect.y + chunkEnd),
    );
    const fraction = (chunkEnd - first) / (last - first);
    if (fraction === 1 || fraction - reported >= PROGRESS_STEP) {
      reported = fraction;
      onProgress(fraction);
    }
    chunkStart = chunkEnd;
  }
}

function noProgress(): void {}

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

const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** Returns the largest-area axis-aligned rectangle every one of `spans` covers (exclusive far edges); a zero rect when none. */
export function fullCoverageRect(spans: readonly RowSpans[], size: Size): Rect {
  const { width } = size;
  // One closing bar of height 0 after the last column, so every run of bars ends inside the histogram.
  const heights = new Int32Array(width + 1);
  const stack = new Int32Array(width + 2);
  let best = EMPTY_RECT;
  const columns = indices(width);
  for (const y of indices(size.height)) {
    const first = Math.max(...spans.map((row) => row.start[y]));
    const last = Math.min(...spans.map((row) => row.end[y]));
    for (const x of columns) {
      heights[x] = x >= first && x < last ? heights[x] + 1 : 0;
    }
    best = largerRect(best, widestRectOnRow(heights, stack, y));
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
