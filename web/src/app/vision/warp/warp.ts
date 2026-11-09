import { invertHomography } from '../geometry/homography';
import { createBandedRows, rowOf } from '../image/banded';
import type {
  AlignedFrame,
  Homography,
  RgbaImage,
  RowRange,
  Size,
} from '../types';

const RGBA = 4;
const TAPS = 4;
const RGB = 3;

/** A cubic sampling kernel of the Mitchell–Netravali family: B softens, C sharpens; (0, ½) is Catmull-Rom. */
export interface WarpKernel {
  readonly b: number;
  readonly c: number;
}

/** Catmull-Rom: keeps the most detail of a resampled frame, and the noise with it; for frames that have little. */
export const SHARP_KERNEL: WarpKernel = { b: 0, c: 0.5 };
/** Mitchell–Netravali: about as soft as bilinear on average, without its blocky steps; for noisy frames. */
export const SOFT_KERNEL: WarpKernel = { b: 1 / 3, c: 1 / 3 };

/** Noise (Immerkaer sigma, 8-bit levels) up to which a frame is sharp enough for the sharp kernel to pay off. */
export const SHARP_KERNEL_MAX_NOISE = 3;

/** The kernel a frame of this `noise` level is resampled with: sharp where there is little noise to keep, soft where there is a lot. */
export function kernelForNoise(noise: number): WarpKernel {
  return noise <= SHARP_KERNEL_MAX_NOISE ? SHARP_KERNEL : SOFT_KERNEL;
}

function cubic(distance: number, kernel: WarpKernel): number {
  const { b, c } = kernel;
  const d = Math.abs(distance);
  if (d < 1)
    return (
      ((12 - 9 * b - 6 * c) * d * d * d +
        (-18 + 12 * b + 6 * c) * d * d +
        (6 - 2 * b)) /
      6
    );
  if (d < 2)
    return (
      ((-b - 6 * c) * d * d * d +
        (6 * b + 30 * c) * d * d +
        (-12 * b - 48 * c) * d +
        (8 * b + 24 * c)) /
      6
    );
  return 0;
}

/** The four weights for the samples at -1, 0, 1 and 2 around a point `fraction` (0–1) past sample 0; they sum to 1. */
export function cubicWeights(
  fraction: number,
  weights: Float64Array,
  kernel: WarpKernel,
): void {
  weights[0] = cubic(1 + fraction, kernel);
  weights[1] = cubic(fraction, kernel);
  weights[2] = cubic(1 - fraction, kernel);
  weights[3] = cubic(2 - fraction, kernel);
}

interface Sampler {
  readonly source: RgbaImage;
  readonly kernel: WarpKernel;
  // Scratch for one sample: the weights along each axis and the byte offsets of the taps they apply to.
  readonly weightsX: Float64Array;
  readonly weightsY: Float64Array;
  readonly columnOffsets: Int32Array;
  readonly rowOffsets: Int32Array;
}

/** Writes the RGB at (`sourceX`, `sourceY`) of the source into `row` from `output` on: a 4 × 4 neighbourhood, taps clamped to the image. */
function resample(
  row: Uint8ClampedArray,
  output: number,
  sampler: Sampler,
  sourceX: number,
  sourceY: number,
): void {
  const { source, kernel, weightsX, weightsY, columnOffsets, rowOffsets } =
    sampler;
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  cubicWeights(sourceX - x0, weightsX, kernel);
  cubicWeights(sourceY - y0, weightsY, kernel);
  for (let tap = 0; tap < TAPS; tap += 1) {
    columnOffsets[tap] =
      Math.min(Math.max(x0 + tap - 1, 0), source.width - 1) * RGBA;
    rowOffsets[tap] =
      Math.min(Math.max(y0 + tap - 1, 0), source.height - 1) *
      source.width *
      RGBA;
  }
  for (let channel = 0; channel < RGB; channel += 1) {
    let value = 0;
    for (let tapY = 0; tapY < TAPS; tapY += 1) {
      let across = 0;
      for (let tapX = 0; tapX < TAPS; tapX += 1)
        across +=
          weightsX[tapX] *
          source.data[rowOffsets[tapY] + columnOffsets[tapX] + channel];
      value += weightsY[tapY] * across;
    }
    // The row clamps to 0–255: the cubic overshoots at a hard edge.
    row[output + channel] = value;
  }
}

/** The frame to warp into; with `rows`, only those rows are computed and only their bands allocated, the rest left empty and uncovered. */
export interface WarpTarget extends Size {
  readonly rows?: RowRange;
}

/**
 * Returns `source` inverse-warped (bicubic: bilinear softens every resampled frame, to a third of its detail on a photo) through `homography` (source → target) into a `target`-sized RGB frame and the columns each row covers;
 * throws when the homography is singular.
 */
export function warpRgba(
  source: RgbaImage,
  homography: Homography,
  target: WarpTarget,
  kernel: WarpKernel = SHARP_KERNEL,
): AlignedFrame {
  const inverse = invertHomography(homography);
  if (inverse === null) {
    throw new Error('warpRgba: the homography is singular');
  }
  const { width, height, rows = { start: 0, end: height } } = target;
  const image = createBandedRows(target, rows);
  const start = new Int32Array(height).fill(width);
  const end = new Int32Array(height);
  const sourceXs = new Float64Array(width);
  const sourceYs = new Float64Array(width);
  const sourceWidth = source.width;
  const sampler: Sampler = {
    source,
    kernel,
    weightsX: new Float64Array(TAPS),
    weightsY: new Float64Array(TAPS),
    columnOffsets: new Int32Array(TAPS),
    rowOffsets: new Int32Array(TAPS),
  };
  const maxX = sourceWidth - 1;
  const maxY = source.height - 1;
  const [stepX, , , stepY, , , stepW] = inverse;
  for (let y = rows.start; y < rows.end; y += 1) {
    // Homogeneous source coordinates of (0, y), advanced by one column per step.
    let homogeneousX = inverse[1] * y + inverse[2];
    let homogeneousY = inverse[4] * y + inverse[5];
    let homogeneousW = inverse[7] * y + inverse[8];
    let first = width;
    let last = -1;
    for (let x = 0; x < width; x += 1) {
      const sourceX = homogeneousX / homogeneousW;
      const sourceY = homogeneousY / homogeneousW;
      // w ≤ 0 is behind the camera; w = 0 yields NaN, which also fails the range checks.
      const covered =
        homogeneousW > 0 &&
        sourceX >= 0 &&
        sourceX <= maxX &&
        sourceY >= 0 &&
        sourceY <= maxY;
      homogeneousX += stepX;
      homogeneousY += stepY;
      homogeneousW += stepW;
      sourceXs[x] = sourceX;
      sourceYs[x] = sourceY;
      if (!covered) continue;
      first = Math.min(first, x);
      last = x;
    }
    // The source rectangle maps to a convex region, so a row covers one run; clamping only matters at rounding noise on its rim.
    start[y] = first;
    end[y] = last + 1;
    const row = rowOf(image, y);
    for (let x = first; x <= last; x += 1) {
      const sourceX = Math.min(Math.max(sourceXs[x], 0), maxX);
      const sourceY = Math.min(Math.max(sourceYs[x], 0), maxY);
      resample(row, x * RGB, sampler, sourceX, sourceY);
    }
  }
  return { image, spans: { start, end } };
}
