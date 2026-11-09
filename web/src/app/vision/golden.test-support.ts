import { invertHomography } from './geometry/homography';
import { createBandedRows, rowOf } from './image/banded';
import type {
  AlignedFrame,
  Homography,
  RgbaImage,
  RowRange,
  Size,
} from './types';

const RGB = 3;
const RGBA = 4;

interface WarpTarget extends Size {
  readonly rows?: RowRange;
}

// Digests recorded from the kernels before the RGB, row-span and band rewrite: the rewrite must reproduce them bit for bit.

/** A small seeded PRNG (mulberry32), so the golden inputs are the same on every run and engine. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An opaque `width × height` image of seeded noise. */
export function noiseRgba(
  width: number,
  height: number,
  seed: number,
): RgbaImage {
  const next = seededRandom(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = Math.floor(next() * 256);
    data[offset + 1] = Math.floor(next() * 256);
    data[offset + 2] = Math.floor(next() * 256);
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

/** FNV-1a over bytes fed one at a time. */
export function digest(): {
  add: (byte: number) => void;
  value: () => number;
} {
  let hash = 2166136261;
  return {
    add: (byte) => {
      hash = Math.imul(hash ^ (byte & 255), 16777619);
    },
    value: () => hash >>> 0,
  };
}

/** Four source → target transforms: two shifts, a small rotation and a scale with perspective. */
export const GOLDEN_HOMOGRAPHIES: readonly Homography[] = [
  [1, 0, 1.5, 0, 1, -2.25, 0, 0, 1],
  [
    Math.cos(0.05),
    -Math.sin(0.05),
    1.2,
    Math.sin(0.05),
    Math.cos(0.05),
    -0.8,
    0,
    0,
    1,
  ],
  [1.02, 0.01, -0.4, -0.01, 1.02, 0.3, 1e-4, -2e-4, 1],
  [1, 0, -3.7, 0, 1, 1.2, 0, 0, 1],
].map((entries) => Float64Array.from(entries));

/** The warped frames' size; the source is noise 41 × 33 (seed 1), the reference noise of this size (seed 2). */
export const GOLDEN_TARGET: Size = { width: 37, height: 29 };

export const GOLDEN = {
  warp: [1957438214, 3661746345, 678904605, 1896834394],
  // Recorded from the production warp's sharp kernel when it replaced bilinear, not from the originals: a pin against drift.
  warpSharp: [875133213, 3311088450, 2770469466, 2617330574],
  gain: [
    [0.8968387776606954, 1.059367342392515, 1.0467131922557407],
    [0.9261363636363636, 1.1914307191180156, 1.083524441762221],
    [0.9206591727600131, 1.086601854955861, 1.0415049590340664],
    [0.8804525182203851, 1.1074285714285714, 1.055693909893593],
  ],
  gained: [135715766, 815841895, 3195278434, 170272627],
  rect: { x: 2, y: 2, width: 35, height: 27 },
  stack: {
    median: 1666609237,
    trimmed: 2718214621,
    clipped: 2467674779,
    mode: 256855439,
    mean: 2579881745,
  },
  composite: [
    1420880206, 729553276, 3176260817, 3856113910, 401286400, 4239787761,
  ],
  bigComposite: [1885467925, 256513375, 710748728, 744051145],
  blur: [
    3818518751, 3996484656, 1939418882, 1260030342, 217835246, 1156388479,
    3818518751,
  ],
} as const;

/**
 * The bilinear warp the digests below were recorded with, kept as the reference they were taken from: the stack, gain and composite
 * digests must not move when the production warp's sampling kernel does.
 */
export function bilinearWarpRgba(
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
