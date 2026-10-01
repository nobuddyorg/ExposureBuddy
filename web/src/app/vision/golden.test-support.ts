import type { Homography, RgbaImage, Size } from './types';

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
