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
import { warpRgba as warpToFrame } from './warp';

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

// The reference: bilinear over the 2×2 neighbourhood with the far sample clamped to the image.
function sampleBilinear(image: RgbaImage, x: number, y: number): number[] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, image.width - 1);
  const y1 = Math.min(y0 + 1, image.height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (px: number, py: number) => pixelAt(image, px, py);
  return [0, 1, 2].map(
    (channel) =>
      (1 - fx) * (1 - fy) * at(x0, y0)[channel] +
      fx * (1 - fy) * at(x1, y0)[channel] +
      (1 - fx) * fy * at(x0, y1)[channel] +
      fx * fy * at(x1, y1)[channel],
  );
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

function warpRgba(source: RgbaImage, homography: Homography, target: Size) {
  return unpack(warpToFrame(source, homography, target));
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

  it('keeps a constant image constant wherever covered, for any sane homography', () => {
    const constant = makeImage(40, 30, () => [37, 200, 91, 255]);
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
  });

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
        const expected = sampleBilinear(patterned, source.x, source.y);
        const actual = pixelAt(image, x, y);
        for (let channel = 0; channel < 3; channel += 1) {
          expect(
            Math.abs(actual[channel] - expected[channel]),
          ).toBeLessThanOrEqual(1);
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

  it('throws on a singular homography', () => {
    expect(() =>
      warpToFrame(patterned, new Float64Array(9), patterned),
    ).toThrow(/singular/);
  });
});
