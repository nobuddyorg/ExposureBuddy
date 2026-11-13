import {
  allocateBand,
  emptyBandedRgb,
  releaseBandsAbove,
  rowOf,
} from '../image/banded';
import type {
  AlignedFrame,
  BandedRgb,
  GrayImage,
  Rect,
  RowRange,
  RowSpans,
  Size,
  StackResult,
} from '../types';
import { indices } from '../indices';
import { ROBUST_MODE_COUNT, robustBackgrounds } from './backgrounds';
import { cleanMedian } from './cleanBackground';

const RGB = 3;
const OPAQUE = 255;
const PROGRESS_STEP = 0.02;
const HIDDEN_FROM = 128;
const HOLE = 255;

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
    brightest: emptyBandedRgb(rect),
    frameCount,
  };
}

interface StackRowsOptions {
  /** The crop every frame covers entirely (see fullCoverageRect); `stack` is its size. */
  readonly rect: Rect;
  /** Which rows of the frames to stack; the part inside `rect` is. */
  readonly rows: RowRange;
  /** Per frame, in frame order, a mask of the people in it (any size, 128 and up is a person): the median is taken over the frames that do not show one. */
  readonly hidden?: readonly GrayImage[];
  /** The size of `rect`; set to 255 where every frame shows a mover, so no sample of the scene was left for the median. */
  readonly holes?: GrayImage;
  /** Counts, over a sample of the pixels, how often the median absolute deviation of a pixel's values across the frames was 0, 1, 2 … 255 levels: the burst's own noise. */
  readonly noise?: Uint32Array;
  readonly onProgress?: (fraction: number) => void;
}

/**
 * Writes, for every pixel of `rows` inside `rect`, the four background estimates and the mean over all frames into `stack`.
 * Consumes the frames: each band is freed once its rows are stacked, so the peak stays near one copy of the burst.
 */
export function stackRows(
  frames: readonly AlignedFrame[],
  stack: StackResult,
  {
    rect,
    rows,
    hidden,
    holes,
    noise,
    onProgress = noProgress,
  }: StackRowsOptions,
): void {
  if (frames.length === 0)
    throw new Error('stackRows needs at least one frame.');
  if (hidden && hidden.length !== frames.length)
    throw new RangeError(`${hidden.length} masks for ${frames.length} frames.`);
  const frameCount = frames.length;
  const { mean, brightest, backgrounds } = stack;
  const layers = [
    backgrounds.median,
    backgrounds.trimmed,
    backgrounds.clipped,
    backgrounds.mode,
    mean,
    brightest,
  ];
  const work: Workspace = {
    frameCount,
    channels: [0, 1, 2].map(() => new Uint8Array(frameCount)),
    scratch: new Uint8Array(frameCount),
    samples: new Uint8Array(frameCount),
    flags: new Uint8Array(frameCount),
    estimates: new Uint8Array(ROBUST_MODE_COUNT),
  };
  const { bandRows } = mean;
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
    for (let y = chunkStart; y < chunkEnd; y += 1)
      stackRow(work, frames, { y, rect, layers, hidden, holes, noise });
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

/** Stacks row `y` of the crop: every column's three channels into the layers' rows. */
function stackRow(
  work: Workspace,
  frames: readonly AlignedFrame[],
  row: {
    readonly y: number;
    readonly rect: Rect;
    readonly layers: readonly BandedRgb[];
    readonly hidden?: readonly GrayImage[];
    readonly holes?: GrayImage;
    readonly noise?: Uint32Array;
  },
): void {
  const { y, rect, layers, hidden, holes, noise } = row;
  const sourceRows = frames.map((frame) => rowOf(frame.image, rect.y + y));
  const outputs = layers.map((layer) => rowOf(layer, y));
  const masks = hidden && {
    hidden,
    maskRows: hidden.map((mask, frame) =>
      maskRowOffset(mask, frames[frame].image, rect.y + y),
    ),
    flags: work.flags,
  };
  for (const x of indices(rect.width)) {
    if (masks) {
      // Every frame has the working size, so one width places the pixel in every mask.
      const shown = flagHiddenFrames(
        masks,
        (rect.x + x + 0.5) / frames[0].image.width,
      );
      if (holes && !shown) holes.data[y * rect.width + x] = HOLE;
    }
    for (let channel = 0; channel < RGB; channel += 1) {
      stackSample(work, {
        sourceRows,
        outputs,
        offset: {
          source: (rect.x + x) * RGB + channel,
          target: x * RGB + channel,
        },
        channel,
        masked: hidden !== undefined,
        noise: isNoiseSample(x, y, channel) ? noise : undefined,
      });
    }
  }
}

interface Workspace {
  readonly frameCount: number;
  /** One buffer of the frames' values per colour channel. */
  readonly channels: readonly Uint8Array[];
  readonly scratch: Uint8Array;
  /** The frames' values in frame order, kept intact for the median that leaves the movers out. */
  readonly samples: Uint8Array;
  /** 1 for the frames whose mask hides the pixel. */
  readonly flags: Uint8Array;
  readonly estimates: Uint8Array;
}

// The green channel of one pixel in 32 (every eighth column of every fourth row) is enough to know how noisy a burst is.
function isNoiseSample(x: number, y: number, channel: number): boolean {
  return channel === 1 && (x & 7) === 0 && (y & 3) === 0;
}

/** The median absolute deviation of `values[0, count)` from `median`, rounded and capped at 255; `scratch` is overwritten. */
function deviationOf(
  values: Uint8Array,
  median: number,
  scratch: Uint8Array,
  count: number,
): number {
  for (let index = 0; index < count; index += 1)
    scratch[index] = Math.abs(values[index] - median);
  return selectMedian(scratch, count);
}

/** Writes one channel of one pixel into every layer's row, in the order of `layers` in stackRows. */
function stackSample(
  work: Workspace,
  at: {
    readonly sourceRows: readonly Uint8ClampedArray[];
    readonly outputs: readonly Uint8ClampedArray[];
    readonly offset: { readonly source: number; readonly target: number };
    readonly channel: number;
    readonly masked: boolean;
    readonly noise?: Uint32Array;
  },
): void {
  const { frameCount, samples, flags, scratch, estimates } = work;
  const values = work.channels[at.channel];
  const { source, target } = at.offset;
  const [medianRow, trimmedRow, clippedRow, modeRow, meanRow, brightestRow] =
    at.outputs;
  let sum = 0;
  let highest = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    values[frame] = at.sourceRows[frame][source];
    samples[frame] = values[frame];
    sum += values[frame];
    highest = Math.max(highest, values[frame]);
  }
  brightestRow[target] = highest;
  const median = selectMedian(values, frameCount);
  medianRow[target] = at.masked
    ? cleanMedian(
        { values: samples, hidden: flags, count: frameCount, fallback: median },
        scratch,
      )
    : median;
  meanRow[target] = Math.round(sum / frameCount);
  robustBackgrounds({ values, count: frameCount, median }, scratch, estimates);
  if (at.noise) at.noise[deviationOf(values, median, scratch, frameCount)] += 1;
  trimmedRow[target] = estimates[0];
  clippedRow[target] = estimates[1];
  modeRow[target] = estimates[2];
}

/** Sets `flags[frame]` to 1 where the frame's mask hides the pixel at `across` (0–1) of the row; returns whether any frame shows it. */
function flagHiddenFrames(
  masks: {
    readonly hidden: readonly GrayImage[];
    readonly maskRows: readonly number[];
    readonly flags: Uint8Array;
  },
  across: number,
): boolean {
  masks.hidden.forEach((mask, frame) => {
    masks.flags[frame] = isHidden(mask, masks.maskRows[frame], across) ? 1 : 0;
  });
  // One flag per frame: stackRows sizes `flags` to the frame count and the masks to match it.
  return masks.flags.includes(0);
}

// Where row `y` of a frame starts in a mask of any size laid over it; a pixel centre lies below the far edge, so no clamp is needed.
function maskRowOffset(
  mask: GrayImage,
  image: { height: number },
  y: number,
): number {
  return Math.floor(((y + 0.5) / image.height) * mask.height) * mask.width;
}

function isHidden(mask: GrayImage, rowOffset: number, across: number): boolean {
  const column = Math.floor(across * mask.width);
  return mask.data[rowOffset + column] >= HIDDEN_FROM;
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
