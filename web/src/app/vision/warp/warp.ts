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
const RGB = 3;

/** The frame to warp into; with `rows`, only those rows are computed and only their bands allocated, the rest left empty and uncovered. */
export interface WarpTarget extends Size {
  readonly rows?: RowRange;
}

/**
 * Returns `source` inverse-warped through `homography` (source → target) into a `target`-sized RGB frame and the columns each row covers;
 * throws when the homography is singular.
 */
export function warpRgba(
  source: RgbaImage,
  homography: Homography,
  target: WarpTarget,
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
  const sourceData = source.data;
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
      // Bilinear over the 2×2 neighbourhood; on the last row or column the far weight is exactly 0.
      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      const fractionX = sourceX - x0;
      const fractionY = sourceY - y0;
      const weight00 = (1 - fractionX) * (1 - fractionY);
      const weight10 = fractionX * (1 - fractionY);
      const weight01 = (1 - fractionX) * fractionY;
      const weight11 = fractionX * fractionY;
      const offset00 = (y0 * sourceWidth + x0) * RGBA;
      const offset10 = x0 < maxX ? offset00 + RGBA : offset00;
      const offset01 = y0 < maxY ? offset00 + sourceWidth * RGBA : offset00;
      const offset11 = offset01 + (offset10 - offset00);
      const output = x * RGB;
      for (let channel = 0; channel < RGB; channel += 1) {
        row[output + channel] =
          weight00 * sourceData[offset00 + channel] +
          weight10 * sourceData[offset10 + channel] +
          weight01 * sourceData[offset01 + channel] +
          weight11 * sourceData[offset11 + channel];
      }
    }
  }
  return { image, spans: { start, end } };
}
