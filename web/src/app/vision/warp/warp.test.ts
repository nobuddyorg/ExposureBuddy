import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  saneHomographyArbitrary,
  translationHomography,
} from '../geometry/homography.test-support';
import {
  applyHomography,
  identityHomography,
  invertHomography,
} from '../geometry/homography';
import { rowOf } from '../image/banded';
import type { AlignedFrame, Homography, RgbaImage, Size } from '../types';
import {
  SHARP_KERNEL,
  SHARP_KERNEL_MAX_NOISE,
  SOFT_KERNEL,
  cubicWeights,
  kernelForNoise,
  warpRgba as warpToFrame,
  type WarpKernel,
} from './warp';

type Pixel = readonly [number, number, number, number];

function makeImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => Pixel,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(paint(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function pixelAt(image: RgbaImage, x: number, y: number): Pixel {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset],
    image.data[offset + 1],
    image.data[offset + 2],
    image.data[offset + 3],
  ];
}

// The reference: Catmull-Rom over the 4×4 neighbourhood, taps clamped to the image, written as the textbook polynomial.
function catmullRom(distance: number): number {
  const d = Math.abs(distance);
  if (d < 1) return 1.5 * d ** 3 - 2.5 * d ** 2 + 1;
  if (d < 2) return -0.5 * d ** 3 + 2.5 * d ** 2 - 4 * d + 2;
  return 0;
}

function sampleCubic(image: RgbaImage, x: number, y: number): number[] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const clamp = (value: number, max: number) =>
    Math.min(Math.max(value, 0), max);
  return [0, 1, 2].map((channel) => {
    let sum = 0;
    for (let tapY = -1; tapY <= 2; tapY += 1) {
      for (let tapX = -1; tapX <= 2; tapX += 1) {
        const weight =
          catmullRom(x - (x0 + tapX)) * catmullRom(y - (y0 + tapY));
        const px = clamp(x0 + tapX, image.width - 1);
        const py = clamp(y0 + tapY, image.height - 1);
        sum += weight * pixelAt(image, px, py)[channel];
      }
    }
    return sum;
  });
}

/** The warped frame as RGBA with alpha 255 where covered, and its per-pixel coverage: what the checks below read. */
function unpack(frame: AlignedFrame): {
  image: RgbaImage;
  coverage: Uint8Array;
} {
  const { width, height } = frame.image;
  const data = new Uint8ClampedArray(width * height * 4);
  const coverage = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = rowOf(frame.image, y);
    for (let x = 0; x < width; x += 1) {
      const covered = x >= frame.spans.start[y] && x < frame.spans.end[y];
      coverage[y * width + x] = covered ? 1 : 0;
      data.set(row.subarray(x * 3, x * 3 + 3), (y * width + x) * 4);
      data[(y * width + x) * 4 + 3] = covered ? 255 : 0;
    }
  }
  return { image: { width, height, data }, coverage };
}

function warpRgba(
  source: RgbaImage,
  homography: Homography,
  target: Size,
  kernel?: WarpKernel,
) {
  return unpack(warpToFrame(source, homography, target, kernel));
}

function coveredCount(coverage: Uint8Array): number {
  return coverage.reduce((sum, flag) => sum + flag, 0);
}

// A deterministic pattern with distinct values per pixel and an alpha that warping must replace.
const patterned = makeImage(16, 12, (x, y) => [
  x * 15,
  y * 20,
  (x + y) * 7,
  100 + x,
]);

describe('warpRgba', () => {
  it('returns the same pixels with alpha 255 and full coverage for the identity', () => {
    const { image, coverage } = warpRgba(
      patterned,
      identityHomography(),
      patterned,
    );
    expect(image.width).toBe(16);
    expect(image.height).toBe(12);
    expect(coveredCount(coverage)).toBe(16 * 12);
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const [r, g, b] = pixelAt(patterned, x, y);
        expect(pixelAt(image, x, y)).toEqual([r, g, b, 255]);
      }
    }
  });

  it('shifts pixels exactly by an integer translation and leaves the uncovered strip empty', () => {
    const { image, coverage } = warpRgba(
      patterned,
      translationHomography(3, 2),
      patterned,
    );
    expect(coveredCount(coverage)).toBe((16 - 3) * (12 - 2));
    for (let y = 0; y < 12; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const covered = x >= 3 && y >= 2;
        expect(coverage[y * 16 + x]).toBe(covered ? 1 : 0);
        if (covered) {
          const [r, g, b] = pixelAt(patterned, x - 3, y - 2);
          expect(pixelAt(image, x, y)).toEqual([r, g, b, 255]);
        } else {
          expect(pixelAt(image, x, y)).toEqual([0, 0, 0, 0]);
        }
      }
    }
  });

  it('covers only the target pixels that land inside the source for a negative shift and a larger target', () => {
    const { image, coverage } = warpRgba(
      patterned,
      translationHomography(-4, 0),
      { width: 20, height: 12 },
    );
    expect(coveredCount(coverage)).toBe(12 * 12);
    expect(pixelAt(image, 0, 5)).toEqual([4 * 15, 100, 9 * 7, 255]);
    expect(coverage[5 * 20 + 11]).toBe(1);
    expect(coverage[5 * 20 + 12]).toBe(0);
  });

  // Under Stryker's instrumentation, four runners at once, the bicubic warp is several times slower: the longer limit is for that run.
  it(
    'keeps a constant image constant wherever covered, for any sane homography',
    { timeout: 60_000 },
    () => {
      const constant = makeImage(24, 18, () => [37, 200, 91, 255]);
      fc.assert(
        fc.property(saneHomographyArbitrary, (homography) => {
          const { image, coverage } = warpRgba(constant, homography, constant);
          // One verdict per run, not one expect per pixel: 200 runs × 1200 pixels would dominate the suite.
          let mismatches = 0;
          for (let pixel = 0; pixel < coverage.length; pixel += 1) {
            const offset = pixel * 4;
            const expected =
              coverage[pixel] === 1 ? [37, 200, 91, 255] : [0, 0, 0, 0];
            for (let channel = 0; channel < 4; channel += 1) {
              if (image.data[offset + channel] !== expected[channel])
                mismatches += 1;
            }
          }
          expect(mismatches).toBe(0);
        }),
      );
    },
  );

  it('transposes a square image under the axis-swapping homography', () => {
    const square = makeImage(10, 10, (x, y) => [
      x * 20,
      y * 20,
      x * 3 + y * 5,
      255,
    ]);
    const swapAxes = new Float64Array([0, 1, 0, 1, 0, 0, 0, 0, 1]);
    const { image, coverage } = warpRgba(square, swapAxes, square);
    expect(coveredCount(coverage)).toBe(100);
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        expect(pixelAt(image, x, y)).toEqual(pixelAt(square, y, x));
      }
    }
  });

  it('divides by the projective depth: a perspective warp matches a reference sampler', () => {
    const targetToSource = new Float64Array([
      1, 0, 0.5, 0, 1, 0.5, 0.01, 0.005, 1,
    ]);
    const homography = invertHomography(targetToSource);
    expect(homography).not.toBeNull();
    if (homography === null) return;
    const { image, coverage } = warpRgba(patterned, homography, patterned);
    let checked = 0;
    for (let y = 0; y < patterned.height; y += 1) {
      for (let x = 0; x < patterned.width; x += 1) {
        const source = applyHomography(targetToSource, { x, y });
        const inside =
          source.x >= 0 &&
          source.x <= patterned.width - 1 &&
          source.y >= 0 &&
          source.y <= patterned.height - 1;
        expect(coverage[y * patterned.width + x]).toBe(inside ? 1 : 0);
        if (!inside) continue;
        const expected = sampleCubic(patterned, source.x, source.y);
        const actual = pixelAt(image, x, y);
        for (let channel = 0; channel < 3; channel += 1) {
          const clamped = Math.min(Math.max(expected[channel], 0), 255);
          expect(Math.abs(actual[channel] - clamped)).toBeLessThanOrEqual(1);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('interpolates a gradient bilinearly at a half-pixel offset in both axes', () => {
    const gradient = makeImage(12, 10, (x, y) => [
      x * 20,
      y * 20,
      (x + y) * 10,
      255,
    ]);
    const { image, coverage } = warpRgba(
      gradient,
      translationHomography(0.5, 0.5),
      gradient,
    );
    expect(coverage[0]).toBe(0);
    expect(coverage[1 * 12 + 1]).toBe(1);
    for (let y = 1; y < 10; y += 1) {
      for (let x = 1; x < 12; x += 1) {
        const [r, g, b] = pixelAt(image, x, y);
        expect(Math.abs(r - (x - 0.5) * 20)).toBeLessThanOrEqual(1);
        expect(Math.abs(g - (y - 0.5) * 20)).toBeLessThanOrEqual(1);
        expect(Math.abs(b - (x + y - 1) * 10)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('samples the last row and column without reading past the source', () => {
    const { image, coverage } = warpRgba(
      patterned,
      translationHomography(-0.25, -0.25),
      patterned,
    );
    expect(coverage[11 * 16 + 15]).toBe(0);
    expect(coverage[11 * 16 + 14]).toBe(0);
    expect(coverage[10 * 16 + 14]).toBe(1);
    const [r] = pixelAt(image, 14, 10);
    expect(Math.abs(r - 14.25 * 15)).toBeLessThanOrEqual(1);
  });

  it('leaves a target pixel uncovered when its source position lies behind the camera', () => {
    // Target → source has w = 1 - 0.5x: pixel (3, 0) would sample (4, -0) if the sign of w were ignored.
    const targetToSource = new Float64Array([1, 0, -5, 0, 1, 0, -0.5, 0, 1]);
    const homography = invertHomography(targetToSource);
    expect(homography).not.toBeNull();
    if (homography === null) return;
    const { coverage } = warpRgba(patterned, homography, patterned);
    expect(coverage[3]).toBe(0);
    expect(coverage[0]).toBe(0);
    for (let x = 2; x < 16; x += 1) expect(coverage[x]).toBe(0);
  });

  it('covers one run per row and writes nothing outside it', () => {
    const { spans, image } = warpToFrame(
      patterned,
      translationHomography(-4, 0),
      { width: 20, height: 12 },
    );
    expect(Array.from(spans.start)).toEqual(Array(12).fill(0));
    expect(Array.from(spans.end)).toEqual(Array(12).fill(12));
    expect(Array.from(rowOf(image, 5).subarray(12 * 3))).toEqual(
      Array(8 * 3).fill(0),
    );
  });

  it('marks a row the source never reaches as empty', () => {
    const { spans } = warpToFrame(
      patterned,
      translationHomography(0, 5),
      patterned,
    );
    expect(spans.end[4]).toBeLessThanOrEqual(spans.start[4]);
    expect([spans.start[5], spans.end[5]]).toEqual([0, 16]);
  });

  it('marks the rows below the source empty for a shift up', () => {
    const { spans } = warpToFrame(
      patterned,
      translationHomography(0, -5),
      patterned,
    );
    expect([spans.start[6], spans.end[6]]).toEqual([0, 16]);
    expect(spans.end[7]).toBeLessThanOrEqual(spans.start[7]);
  });

  it('ends a row at the target edge when the source reaches past it', () => {
    const { spans } = warpToFrame(patterned, identityHomography(), {
      width: 10,
      height: 12,
    });
    expect(Array.from(spans.end)).toEqual(Array(12).fill(10));
  });

  it('leaves an uncovered row empty even one pixel wide', () => {
    const column = makeImage(1, 4, () => [9, 9, 9, 255]);
    const { spans } = warpToFrame(column, translationHomography(0, 2), column);
    expect(spans.end[0]).toBeLessThanOrEqual(spans.start[0]);
    expect([spans.start[2], spans.end[2]]).toEqual([0, 1]);
  });

  it('writes rows past the first band of a tall target', () => {
    const tall = makeImage(3, 150, (x, y) => [x, y, 7, 255]);
    const warped = warpRgba(tall, translationHomography(0, 1), tall);
    expect(pixelAt(warped.image, 2, 140)).toEqual([2, 139, 7, 255]);
    expect(coveredCount(warped.coverage)).toBe(3 * 149);
  });

  it('warps only the rows asked for, the same as a whole warp there', () => {
    const tall = makeImage(5, 150, (x, y) => [x * 40, y, (x + y) % 256, 255]);
    const shift = translationHomography(0.5, -1.25);
    const whole = warpToFrame(tall, shift, tall);
    const strip = warpToFrame(tall, shift, {
      ...tall,
      rows: { start: 64, end: 128 },
    });
    expect(strip.image.bands.map((band) => band.length)).toEqual([0, 960, 0]);
    for (let y = 64; y < 128; y += 1) {
      expect(Array.from(rowOf(strip.image, y))).toEqual(
        Array.from(rowOf(whole.image, y)),
      );
      expect([strip.spans.start[y], strip.spans.end[y]]).toEqual([
        whole.spans.start[y],
        whole.spans.end[y],
      ]);
    }
    // Rows outside the strip are left uncovered.
    expect(strip.spans.end[10]).toBeLessThanOrEqual(strip.spans.start[10]);
    expect(strip.spans.end[130]).toBeLessThanOrEqual(strip.spans.start[130]);
  });

  it('throws on a singular homography', () => {
    expect(() =>
      warpToFrame(patterned, new Float64Array(9), patterned),
    ).toThrow(/singular/);
  });
});

describe('the sampling kernels', () => {
  const weights = new Float64Array(4);

  it('give weights that sum to 1 at every fraction, for both kernels', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (fraction) => {
        for (const kernel of [SHARP_KERNEL, SOFT_KERNEL]) {
          cubicWeights(fraction, weights, kernel);
          expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(
            1,
            9,
          );
        }
      }),
    );
  });

  it('take the sample itself, whole, at fraction 0 with the sharp kernel', () => {
    cubicWeights(0, weights, SHARP_KERNEL);
    expect([...weights].map((weight) => Math.abs(weight))).toEqual([
      0, 1, 0, 0,
    ]);
  });

  it('blur the sample 1:16:1 with its neighbours at fraction 0 with the soft kernel, and give the tap two away nothing', () => {
    cubicWeights(0, weights, SOFT_KERNEL);
    expect(weights[0]).toBeCloseTo(1 / 18, 12);
    expect(weights[1]).toBeCloseTo(16 / 18, 12);
    expect(weights[2]).toBeCloseTo(1 / 18, 12);
    expect(Math.abs(weights[3])).toBe(0);
  });

  it('keep a hard edge crisper with the sharp kernel than with the soft one, at a half-pixel shift', () => {
    const edge = makeImage(32, 8, (x) =>
      x < 16 ? [40, 40, 40, 255] : [200, 200, 200, 255],
    );
    const run = (kernel: WarpKernel) => {
      const { image } = warpRgba(
        edge,
        translationHomography(0.5, 0),
        edge,
        kernel,
      );
      const row = Array.from({ length: 32 }, (_, x) => pixelAt(image, x, 3)[0]);
      // The steepest step between neighbours: the crisper the edge, the larger it is.
      return Math.max(
        ...row.slice(2, 29).map((value, x) => Math.abs(row[x + 3] - value)),
      );
    };
    expect(run(SHARP_KERNEL)).toBeGreaterThan(run(SOFT_KERNEL));
  });

  it('overshoot at a hard edge and the frame holds the clamped value', () => {
    const edge = makeImage(32, 8, (x) =>
      x < 16 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const { image } = warpRgba(
      edge,
      translationHomography(0.5, 0),
      edge,
      SHARP_KERNEL,
    );
    const row = Array.from({ length: 32 }, (_, x) => pixelAt(image, x, 3)[0]);
    expect(Math.min(...row.slice(2, 30))).toBe(0);
    expect(Math.max(...row.slice(2, 30))).toBe(255);
  });

  it('are chosen by the noise of the frame: sharp up to the limit, soft above it', () => {
    expect(kernelForNoise(0)).toBe(SHARP_KERNEL);
    expect(kernelForNoise(SHARP_KERNEL_MAX_NOISE)).toBe(SHARP_KERNEL);
    expect(kernelForNoise(SHARP_KERNEL_MAX_NOISE + 0.01)).toBe(SOFT_KERNEL);
    expect(kernelForNoise(28)).toBe(SOFT_KERNEL);
  });
});
