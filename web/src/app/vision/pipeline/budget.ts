import { BAND_ROWS } from '../image/banded';
import { indices } from '../indices';
import type { Rect, RowRange, Size } from '../types';

/** Bytes the pipeline may hold, align workers included, where no device budget is given (see deviceBudget.ts). */
export const DEFAULT_BUDGET_BYTES = 256 * 1024 * 1024;
/** Long edge of the grayscale copy features are detected on. */
export const ALIGNMENT_LONG_EDGE = 960;
/** The budget never pushes the working long edge below this; a burst that still does not fit is too large. */
export const MIN_LONG_EDGE = 640;

export type OutputQuality = 'low' | 'standard' | 'high' | 'original';

const QUALITY_LONG_EDGE: Record<OutputQuality, number> = {
  low: 1024,
  standard: 1600,
  high: 2400,
  original: Number.POSITIVE_INFINITY,
};
/** The largest canvas every engine draws: Safari refuses more than 4096 × 4096 pixels. */
export const MAX_WORKING_PIXELS = 4096 * 4096;
/** A burst that does not fit in one pass is stacked in at most this many strips; each one decodes every photo again. */
export const MAX_PASSES = 8;
/** An aligned frame is RGB in bands; what it covers is two numbers per row, not a mask. */
export const FRAME_BYTES_PER_PIXEL = 3;
/** While stacking, on top of the frames: the reference copy kept for compare (3) and one band of the five output layers in flight. */
export const STACKING_OVERHEAD_BYTES_PER_PIXEL = 5;
/**
 * Rendering holds the stack (four backgrounds and the mean, RGB: 15), the reference copy (3), two single-channel float layers (8),
 * the RGBA output (4) and at most one more layer's worth of saved rows in the blur (4); the frames are gone by then.
 */
export const RENDER_BYTES_PER_PIXEL = 34;
/** An align worker holds its photo decoded at full size (4) and the halved copies on the way down (at most 4/3), rounded up. */
export const DECODE_BYTES_PER_SOURCE_PIXEL = 6;
/** An align worker holds, at working size, the decoded RGBA (4), the warped RGB (3) and the grey copies (at most 1). */
export const ALIGN_BYTES_PER_WORKING_PIXEL = 8;
/**
 * A pass over strips holds, on top of the rows of the current strip, the whole reference (3) and its crop for compare (3),
 * and the stack's five layers (15) filling in strip by strip.
 */
const STRIP_BASE_BYTES_PER_PIXEL = 21;
/** The share of the budget the align workers' full-size decodes may take; beyond it fewer workers run. */
const DECODE_SHARE = 0.25;
const MIN_WORKING_EDGE = 2;
const MAX_POOL_SIZE = 4;
const DEFAULT_POOL_SIZE = 2;

/** Returns the output long edge in pixels for `quality`: 1024, 1600, 2400, or no limit but the photo for the original size. */
export function qualityLongEdge(quality: OutputQuality): number {
  return QUALITY_LONG_EDGE[quality];
}

/** How many align workers fit: as many as asked for, at least one, while their full-size decodes stay within DECODE_SHARE of the budget. */
export function alignWorkersFor(input: {
  readonly source: Size;
  readonly requestedWorkers: number;
  readonly budgetBytes: number;
}): number {
  const { source, requestedWorkers, budgetBytes } = input;
  const decodeBytes =
    source.width * source.height * DECODE_BYTES_PER_SOURCE_PIXEL;
  const affordable = Math.floor((budgetBytes * DECODE_SHARE) / decodeBytes);
  return Math.max(1, Math.min(requestedWorkers, affordable));
}

/** Bytes per working pixel while aligning: every frame so far, the stacking overhead and each align worker's buffers. */
export function aligningBytesPerPixel(
  frameCount: number,
  alignWorkers: number,
): number {
  return (
    frameCount * FRAME_BYTES_PER_PIXEL +
    STACKING_OVERHEAD_BYTES_PER_PIXEL +
    alignWorkers * ALIGN_BYTES_PER_WORKING_PIXEL
  );
}

/** The working size, the scale that gives it, how many align workers run at it, and how the rows are split into passes. */
export interface WorkingPlan extends Size {
  readonly scale: number;
  readonly alignWorkers: number;
  /** Rows per strip, a whole number of bands; the height itself when one pass does. */
  readonly stripRows: number;
  readonly passes: number;
}

interface PlanInput {
  readonly source: Size;
  readonly frameCount: number;
  readonly budgetBytes: number;
  readonly maxLongEdge: number;
  readonly requestedWorkers: number;
}

/** Rows per strip for `passes` strips over `height` rows, rounded up to whole bands. */
export function stripRowsFor(height: number, passes: number): number {
  return Math.ceil(height / passes / BAND_ROWS) * BAND_ROWS;
}

/** The peak bytes of a run at `size` in `passes` passes: aligning or strip stacking, whichever is larger, or rendering. */
export function peakBytes(
  input: Omit<PlanInput, 'maxLongEdge' | 'requestedWorkers'> & {
    readonly size: Size;
    readonly alignWorkers: number;
    readonly passes: number;
  },
): number {
  const { size, frameCount, alignWorkers, passes } = input;
  const pixels = size.width * size.height;
  const decodes =
    alignWorkers *
    input.source.width *
    input.source.height *
    DECODE_BYTES_PER_SOURCE_PIXEL;
  const rendering = pixels * RENDER_BYTES_PER_PIXEL;
  if (passes === 1)
    return Math.max(
      pixels * aligningBytesPerPixel(frameCount, alignWorkers) + decodes,
      rendering,
    );
  // Every frame's current strip, and one more per worker in flight.
  const strips =
    (frameCount + alignWorkers) *
    FRAME_BYTES_PER_PIXEL *
    stripRowsFor(size.height, passes) *
    size.width;
  const stripping =
    pixels *
      (STRIP_BASE_BYTES_PER_PIXEL +
        alignWorkers * ALIGN_BYTES_PER_WORKING_PIXEL) +
    strips +
    decodes;
  return Math.max(stripping, rendering);
}

/**
 * Returns the largest working size with the source's aspect, long edge at most `maxLongEdge`, never upscaled, at most
 * MAX_WORKING_PIXELS, both dimensions even and at least 2, whose peak fits `budgetBytes` in as few passes as possible (one when
 * the frames fit whole, else up to MAX_PASSES strips, each of which decodes every photo again).
 * The budget alone never shrinks the long edge below MIN_LONG_EDGE: that size is returned, in MAX_PASSES passes, and the caller decides.
 * `scale` is `width / source.width`, the factor actually applied along x.
 */
export function chooseWorkingSize(input: PlanInput): WorkingPlan {
  const { source, budgetBytes, maxLongEdge } = input;
  const alignWorkers = alignWorkersFor(input);
  const sourceLongEdge = Math.max(source.width, source.height);
  const pixelLimit = Math.sqrt(
    MAX_WORKING_PIXELS / (source.width * source.height),
  );
  const longest = Math.floor(
    Math.min(maxLongEdge, sourceLongEdge, sourceLongEdge * pixelLimit),
  );
  const floor = Math.min(longest, MIN_LONG_EDGE);
  const sizeAt = (longEdge: number): Size => ({
    width: evenAtLeastTwo((source.width * longEdge) / sourceLongEdge),
    height: evenAtLeastTwo((source.height * longEdge) / sourceLongEdge),
  });
  // The fewest passes that fit at this long edge, or none.
  const passesAt = (longEdge: number): number => {
    const size = sizeAt(longEdge);
    const fits = (passes: number) =>
      peakBytes({ ...input, size, alignWorkers, passes }) <= budgetBytes;
    return (
      indices(MAX_PASSES)
        .map((index) => index + 1)
        .find(fits) ?? 0
    );
  };
  // Largest long edge in [floor, longest] that fits, or the floor when none does: memory only grows with the size.
  let low = floor;
  let high = longest;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (passesAt(middle) > 0) low = middle;
    else high = middle - 1;
  }
  const { width, height } = sizeAt(low);
  const passes = passesAt(low) || MAX_PASSES;
  const stripRows = passes === 1 ? height : stripRowsFor(height, passes);
  return {
    width,
    height,
    scale: width / source.width,
    alignWorkers,
    stripRows,
    // Whole bands per strip can make fewer strips than planned: 400 rows in 8 strips round up to 64-row strips, and 7 cover them.
    passes: Math.ceil(height / stripRows),
  };
}

/**
 * The strips a run stacks, top to bottom: the first `stripRows` rows the frames kept on arrival, then one strip of `stripRows` after
 * another until the crop's last row. One range when the crop ends within the first strip.
 */
export function stripRanges(rect: Rect, stripRows: number): RowRange[] {
  const bottom = rect.y + rect.height;
  return indices(Math.max(1, Math.ceil(bottom / stripRows))).map((index) => ({
    start: index * stripRows,
    end: Math.min((index + 1) * stripRows, bottom),
  }));
}

/** What a burst will come out as: the working size, whether memory made it smaller than the chosen size and the photo allow, and in how many passes. */
export interface OutputEstimate extends Size {
  readonly limited: boolean;
  readonly passes: number;
}

/** The working size the pipeline will pick for this burst, from the same plan it uses; the crop can only make it smaller. */
export function estimateOutput(input: {
  readonly source: Size;
  readonly frameCount: number;
  readonly budgetBytes: number;
  readonly quality: OutputQuality;
  readonly requestedWorkers: number;
}): OutputEstimate {
  const maxLongEdge = qualityLongEdge(input.quality);
  const { width, height, passes } = chooseWorkingSize({
    ...input,
    maxLongEdge,
  });
  const { source } = input;
  const wanted = Math.min(
    maxLongEdge,
    Math.max(source.width, source.height) *
      Math.min(
        1,
        Math.sqrt(MAX_WORKING_PIXELS / (source.width * source.height)),
      ),
  );
  // Even rounding may take up to two pixels off an unlimited size; memory takes more.
  return {
    width,
    height,
    limited: Math.max(width, height) < wanted - 2,
    passes,
  };
}

function evenAtLeastTwo(value: number): number {
  return Math.max(MIN_WORKING_EDGE, Math.floor(value / 2) * 2);
}

/** Returns how many align workers to run: `hardwareConcurrency − 1` clamped to [1, 4]; 2 when unknown. */
export function workerPoolSize(
  hardwareConcurrency: number | undefined,
): number {
  if (hardwareConcurrency === undefined) return DEFAULT_POOL_SIZE;
  return Math.min(MAX_POOL_SIZE, Math.max(1, hardwareConcurrency - 1));
}
