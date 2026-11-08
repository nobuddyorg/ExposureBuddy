import { describe, expect, it } from 'vitest';

import { fractalNoise, valueNoise } from './effects/noise';
import {
  applyHomography,
  composeHomographies,
  invertHomography,
} from './geometry/homography';
import { bandedFromRgba, toRgba } from './image/banded';
import { alignToReference, analyseReference } from './pipeline/alignment';
import { seededRandom } from './golden.test-support';
import { composite } from './stack/composite';
import { defaultCompositeParams } from './stack/compositeParams';
import { fullCoverageRect } from './stack/stack';
import { fullSpans, stackFrames } from './stack/synthetic.test-support';
import type { AlignedFrame, Homography, Rect, RgbaImage } from './types';
import { warpRgba } from './warp/warp';

// The stacking-quality benchmark: a synthetic burst with a known answer, run through today's align and stack kernels.
// It prints one row per light level (run with `npx vitest run src/app/vision/stackingQuality.test.ts`) and holds the numbers it measured as floors.
// Working size 320 × 240, 10 frames, a 28 px square crossing the scene; the reference is the middle frame.

const SIZE = { width: 320, height: 240 };
const FRAME_COUNT = 10;
const REFERENCE = 5;
const MOVER = 28;
const MOVER_ROW = 100;

type Light = 'daylight' | 'dim' | 'dark';
/** Gaussian sensor noise per light level, in 8-bit levels: what a phone's burst looks like by day, indoors and at night. */
const NOISE_SIGMA: Record<Light, number> = { daylight: 2, dim: 12, dark: 28 };

function sceneImage(): RgbaImage {
  const random = seededRandom(5);
  const data = new Uint8ClampedArray(SIZE.width * SIZE.height * 4);
  for (let y = 0; y < SIZE.height; y += 1) {
    for (let x = 0; x < SIZE.width; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        data[(y * SIZE.width + x) * 4 + channel] =
          30 +
          fractalNoise(x / 18, y / 18, channel) * 170 +
          valueNoise(x / 3, y / 3, 9 + channel) * 25;
      }
      data[(y * SIZE.width + x) * 4 + 3] = 255;
    }
  }
  for (let block = 0; block < 25; block += 1) {
    const rect = {
      x: Math.floor(random() * 280),
      y: Math.floor(random() * 200),
      width: 10 + Math.floor(random() * 30),
      height: 10 + Math.floor(random() * 30),
    };
    const color = [random() * 255, random() * 255, random() * 255];
    paint(data, rect, color);
  }
  return { ...SIZE, data };
}

function paint(
  data: Uint8ClampedArray,
  rect: Rect,
  color: readonly number[],
): void {
  for (let y = rect.y; y < Math.min(SIZE.height, rect.y + rect.height); y += 1)
    for (let x = rect.x; x < Math.min(SIZE.width, rect.x + rect.width); x += 1)
      data.set(color, (y * SIZE.width + x) * 4);
}

/** The camera's small shake, scene → frame: a similarity of at most 1.5°, 3 % of a shift and 1.5 % of scale about the centre. */
function shake(index: number): Homography {
  const random = seededRandom(100 + index);
  const angle = ((random() - 0.5) * 3 * Math.PI) / 180;
  const scale = 1 + (random() - 0.5) * 0.03;
  const shiftX = (random() - 0.5) * 0.06 * SIZE.width;
  const shiftY = (random() - 0.5) * 0.06 * SIZE.height;
  const cx = SIZE.width / 2;
  const cy = SIZE.height / 2;
  const cos = Math.cos(angle) * scale;
  const sin = Math.sin(angle) * scale;
  return Float64Array.from([
    cos,
    -sin,
    cx - cos * cx + sin * cy + shiftX,
    sin,
    cos,
    cy - sin * cx - cos * cy + shiftY,
    0,
    0,
    1,
  ]);
}

function gaussian(random: () => number): number {
  return (
    Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
  );
}

function moverRect(index: number): Rect {
  return { x: 20 + index * 28, y: MOVER_ROW, width: MOVER, height: MOVER };
}

/** One frame as the camera saw it: the scene through the shake, the mover on top, and sensor noise. */
function shoot(scene: RgbaImage, index: number, light: Light): RgbaImage {
  const shaken = toRgba(warpRgba(scene, shake(index), SIZE).image);
  paint(shaken.data, moverRect(index), [250, 250, 250]);
  const random = seededRandom(1000 + index);
  const sigma = NOISE_SIGMA[light];
  for (let offset = 0; offset < shaken.data.length; offset += 4)
    for (let channel = 0; channel < 3; channel += 1)
      shaken.data[offset + channel] += gaussian(random) * sigma;
  return shaken;
}

function psnr(a: RgbaImage, b: RgbaImage, within: Rect): number {
  let squares = 0;
  let count = 0;
  for (let y = within.y; y < within.y + within.height; y += 1)
    for (let x = within.x; x < within.x + within.width; x += 1)
      for (let channel = 0; channel < 3; channel += 1) {
        const difference =
          a.data[(y * a.width + x) * 4 + channel] -
          b.data[(y * b.width + x) * 4 + channel];
        squares += difference * difference;
        count += 1;
      }
  return 10 * Math.log10((255 * 255) / (squares / count));
}

function alignmentError(estimate: Homography, truth: Homography): number {
  let total = 0;
  let count = 0;
  for (let gy = 0; gy <= 4; gy += 1)
    for (let gx = 0; gx <= 4; gx += 1) {
      const point = {
        x: (gx * (SIZE.width - 1)) / 4,
        y: (gy * (SIZE.height - 1)) / 4,
      };
      const a = applyHomography(estimate, point);
      const b = applyHomography(truth, point);
      total += Math.hypot(a.x - b.x, a.y - b.y);
      count += 1;
    }
  return total / count;
}

interface Measurement {
  readonly light: Light;
  /** Frames that aligned, of the nine that had to. */
  readonly aligned: number;
  /** Mean distance in px between the fitted and the true frame → reference transform, over a 5 × 5 grid. */
  readonly alignmentErrorPx: number;
  /** PSNR in dB of each estimate of the static scene against the noise-free truth, inside the common crop. */
  readonly psnr: { readonly median: number; readonly mean: number };
  /** PSNR of the median over the pixels the mover crossed: ghosts left in the "empty" scene show up here. */
  readonly moverPathPsnr: number;
}

function measure(light: Light): Measurement {
  const scene = sceneImage();
  const frames = Array.from({ length: FRAME_COUNT }, (_, index) =>
    shoot(scene, index, light),
  );
  const reference = analyseReference(frames[REFERENCE]);
  const referenceShake = shake(REFERENCE);
  const aligned: AlignedFrame[] = [];
  const errors: number[] = [];
  frames.forEach((frame, index) => {
    if (index === REFERENCE) {
      aligned.push({ image: bandedFromRgba(frame), spans: fullSpans(SIZE) });
      return;
    }
    const outcome = alignToReference(frame, reference.features);
    if (outcome.kind !== 'aligned') return;
    aligned.push(outcome.frame);
    const inverse = invertHomography(shake(index));
    if (!inverse) throw new Error('a shake is never singular');
    errors.push(
      alignmentError(
        outcome.homography,
        composeHomographies(referenceShake, inverse),
      ),
    );
  });
  const crop = fullCoverageRect(
    aligned.map((frame) => frame.spans),
    SIZE,
  );
  const stack = stackFrames(aligned, { rect: crop });
  const clean = toRgba(warpRgba(scene, referenceShake, SIZE).image);
  const render = (background: 'median' | 'mean'): RgbaImage => {
    const params = {
      ...defaultCompositeParams({ frameCount: aligned.length, longEdge: 320 }),
      background: 'median' as const,
      ghostStrength: background === 'mean' ? 1 : 0,
      ghostBlur: 0,
      glow: 0,
    };
    const cropped = composite(stack, params);
    // Back to full-frame coordinates, so one rectangle indexes both images.
    const full = {
      ...SIZE,
      data: new Uint8ClampedArray(SIZE.width * SIZE.height * 4),
    };
    for (let y = 0; y < crop.height; y += 1)
      for (let x = 0; x < crop.width; x += 1)
        full.data.set(
          cropped.data.subarray(
            (y * crop.width + x) * 4,
            (y * crop.width + x) * 4 + 4,
          ),
          ((crop.y + y) * SIZE.width + crop.x + x) * 4,
        );
    return full;
  };
  const median = render('median');
  const path: Rect = {
    x: Math.max(crop.x, moverRect(0).x),
    y: MOVER_ROW,
    width:
      Math.min(crop.x + crop.width, moverRect(FRAME_COUNT - 1).x + MOVER) -
      Math.max(crop.x, moverRect(0).x),
    height: MOVER,
  };
  return {
    light,
    aligned: errors.length,
    alignmentErrorPx:
      errors.reduce((a, b) => a + b, 0) / Math.max(1, errors.length),
    psnr: {
      median: psnr(median, clean, crop),
      mean: psnr(render('mean'), clean, crop),
    },
    moverPathPsnr: psnr(median, clean, path),
  };
}

describe('stacking quality on a synthetic burst', () => {
  const measurements = (['daylight', 'dim', 'dark'] as const).map(measure);

  it('prints the numbers a change to alignment or stacking is judged by', () => {
    const rows = measurements.map((m) => ({
      light: m.light,
      aligned: `${m.aligned}/${FRAME_COUNT - 1}`,
      'alignment error (px)': Number(m.alignmentErrorPx.toFixed(3)),
      'median PSNR (dB)': Number(m.psnr.median.toFixed(2)),
      'mean PSNR (dB)': Number(m.psnr.mean.toFixed(2)),
      'mover path PSNR (dB)': Number(m.moverPathPsnr.toFixed(2)),
    }));
    console.table(rows);
    expect(rows).toHaveLength(3);
  });

  // The floors are the numbers measured after noise-adaptive smoothing went in front of the feature detector.
  // Before it (same burst): dim 0.674 px / 35.72 dB; dark 2 of 9 frames aligned, 0.861 px / 24.71 dB median; daylight unchanged.
  const [day, dim, dark] = measurements;

  it('aligns every frame by day, to a tenth of a pixel, and recovers the scene to 41 dB', () => {
    expect(day.aligned).toBe(FRAME_COUNT - 1);
    expect(day.alignmentErrorPx).toBeLessThan(0.15);
    expect(day.psnr.median).toBeGreaterThan(41);
  });

  it('aligns every frame indoors, to under half a pixel', () => {
    expect(dim.aligned).toBe(FRAME_COUNT - 1);
    expect(dim.alignmentErrorPx).toBeLessThan(0.45);
    expect(dim.psnr.median).toBeGreaterThan(35.8);
  });

  it('aligns every frame at night, where unsmoothed features aligned two of nine', () => {
    expect(dark.aligned).toBe(FRAME_COUNT - 1);
    expect(dark.alignmentErrorPx).toBeLessThan(1);
    expect(dark.psnr.median).toBeGreaterThan(29.5);
  });
});
