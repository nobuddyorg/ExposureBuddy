import type { Size } from '../types';

/** Bytes the pipeline may hold at working resolution: the aligned frames while stacking, or the render buffers afterwards. */
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
/** An aligned frame is RGBA plus its coverage mask. */
export const FRAME_BYTES_PER_PIXEL = 5;
/** The stack keeps the median and mean (RGBA), the deviation and the coverage count. */
export const STACK_BYTES_PER_PIXEL = 10;
/** Rendering adds three Float32 RGB layers, the blur scratch and the output on top of the stack; the frames are gone by then. */
export const RENDER_BYTES_PER_PIXEL = 80;
const MIN_WORKING_EDGE = 2;
const MAX_POOL_SIZE = 4;
const DEFAULT_POOL_SIZE = 2;

/** Returns the output long edge in pixels for `quality`: 1024, 1600 or 2400. */
export function qualityLongEdge(quality: OutputQuality): number {
  return QUALITY_LONG_EDGE[quality];
}

/** Bytes per working pixel at the pipeline's peak: stacking holds every frame, rendering holds the scratch layers. */
export function peakBytesPerPixel(frameCount: number): number {
  return Math.max(
    frameCount * FRAME_BYTES_PER_PIXEL + STACK_BYTES_PER_PIXEL,
    RENDER_BYTES_PER_PIXEL,
  );
}

/**
 * Returns the largest size with the source's aspect whose `peakBytesPerPixel(frameCount) × width × height` bytes fit `budgetBytes`
 * and whose long edge is at most `maxLongEdge`, never upscaled, both dimensions even and at least 2.
 * The budget alone never shrinks the long edge below MIN_LONG_EDGE: that size is returned and the caller decides.
 * `scale` is `width / source.width`, the factor actually applied along x.
 */
export function chooseWorkingSize(input: {
  readonly source: Size;
  readonly frameCount: number;
  readonly budgetBytes: number;
  readonly maxLongEdge: number;
}): Size & { readonly scale: number } {
  const { source, frameCount, budgetBytes, maxLongEdge } = input;
  const longEdge = Math.max(source.width, source.height);
  const edgeScale = Math.min(1, maxLongEdge / longEdge);
  const budgetPixels = budgetBytes / peakBytesPerPixel(frameCount);
  const budgetScale = Math.sqrt(budgetPixels / (source.width * source.height));
  const floorScale = Math.min(edgeScale, MIN_LONG_EDGE / longEdge);
  const scale = Math.max(Math.min(edgeScale, budgetScale), floorScale);
  const width = evenAtLeastTwo(source.width * scale);
  const height = evenAtLeastTwo(source.height * scale);
  return { width, height, scale: width / source.width };
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
