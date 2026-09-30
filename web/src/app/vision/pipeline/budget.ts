import type { Size } from '../types';

/** Bytes the pipeline may hold, align workers included, where no device budget is given (see deviceBudget.ts). */
export const DEFAULT_BUDGET_BYTES = 256 * 1024 * 1024;
/** Long edge of the grayscale copy features are detected on. */
export const ALIGNMENT_LONG_EDGE = 960;
/** The budget never pushes the working long edge below this; a burst that still does not fit is too large. */
export const MIN_LONG_EDGE = 640;

export type OutputQuality = 'low' | 'standard' | 'high';

const QUALITY_LONG_EDGE: Record<OutputQuality, number> = {
  low: 1024,
  standard: 1600,
  high: 2400,
};
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
/** The share of the budget the align workers' full-size decodes may take; beyond it fewer workers run. */
const DECODE_SHARE = 0.25;
const MIN_WORKING_EDGE = 2;
const MAX_POOL_SIZE = 4;
const DEFAULT_POOL_SIZE = 2;

/** Returns the output long edge in pixels for `quality`: 1024, 1600 or 2400. */
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

/** The working size, the scale that gives it, and how many align workers run at it. */
export interface WorkingPlan extends Size {
  readonly scale: number;
  readonly alignWorkers: number;
}

/**
 * Returns the largest size with the source's aspect whose peak fits `budgetBytes`, and whose long edge is at most `maxLongEdge`,
 * never upscaled, both dimensions even and at least 2. The peak is the larger of aligning (the frames, the overhead, the workers'
 * working-size buffers, plus their full-size decodes) and rendering (RENDER_BYTES_PER_PIXEL).
 * The budget alone never shrinks the long edge below MIN_LONG_EDGE: that size is returned and the caller decides.
 * `scale` is `width / source.width`, the factor actually applied along x.
 */
export function chooseWorkingSize(input: {
  readonly source: Size;
  readonly frameCount: number;
  readonly budgetBytes: number;
  readonly maxLongEdge: number;
  readonly requestedWorkers: number;
}): WorkingPlan {
  const { source, frameCount, budgetBytes, maxLongEdge } = input;
  const alignWorkers = alignWorkersFor(input);
  const sourcePixels = source.width * source.height;
  const decodeBytes =
    alignWorkers * sourcePixels * DECODE_BYTES_PER_SOURCE_PIXEL;
  const budgetPixels = Math.max(
    0,
    Math.min(
      (budgetBytes - decodeBytes) /
        aligningBytesPerPixel(frameCount, alignWorkers),
      budgetBytes / RENDER_BYTES_PER_PIXEL,
    ),
  );
  const longEdge = Math.max(source.width, source.height);
  const edgeScale = Math.min(1, maxLongEdge / longEdge);
  const budgetScale = Math.sqrt(budgetPixels / sourcePixels);
  const floorScale = Math.min(edgeScale, MIN_LONG_EDGE / longEdge);
  const scale = Math.max(Math.min(edgeScale, budgetScale), floorScale);
  const width = evenAtLeastTwo(source.width * scale);
  const height = evenAtLeastTwo(source.height * scale);
  return { width, height, scale: width / source.width, alignWorkers };
}

/** What a burst will come out as: the working size, and whether memory made it smaller than the chosen size and the photo allow. */
export interface OutputEstimate extends Size {
  readonly limited: boolean;
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
  const { width, height } = chooseWorkingSize({ ...input, maxLongEdge });
  const wanted = Math.min(
    maxLongEdge,
    Math.max(input.source.width, input.source.height),
  );
  // Even rounding may take up to two pixels off an unlimited size; memory takes more.
  return { width, height, limited: Math.max(width, height) < wanted - 2 };
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
