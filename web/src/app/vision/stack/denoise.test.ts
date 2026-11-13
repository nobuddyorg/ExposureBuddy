import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { bandedFromRgba, toRgba } from '../image/banded';
import { seededRandom } from '../golden.test-support';
import {
  DENOISE_STRENGTH,
  denoiseBanded,
  denoiseRadius,
  guidedFilter,
  stackedNoise,
} from './denoise';

const W = 40;
const H = 30;
const SIZE = { width: W, height: H };

function gaussian(random: () => number): number {
  return (
    Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())
  );
}

/** A flat grey with a vertical step in the middle, plus noise of `sigma`. */
function stepScene(
  sigma: number,
  seed = 7,
): { clean: Float32Array; noisy: Float32Array } {
  const random = seededRandom(seed);
  const clean = new Float32Array(W * H);
  const noisy = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) {
      const value = x < W / 2 ? 60 : 180;
      clean[y * W + x] = value;
      noisy[y * W + x] = value + gaussian(random) * sigma;
    }
  return { clean, noisy };
}

const rmse = (
  a: Float32Array,
  b: Float32Array,
  from = 0,
  to = a.length,
): number => {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / (to - from));
};

describe('guidedFilter', () => {
  it('keeps a constant image constant, whatever the strength', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        (value, epsilon) => {
          const flat = new Float32Array(W * H).fill(value);
          const out = guidedFilter(flat, SIZE, 2, epsilon);
          expect(out.every((v) => Math.abs(v - value) < 1e-3)).toBe(true);
        },
      ),
    );
  });

  it('removes much of the noise from flat areas', () => {
    const { clean, noisy } = stepScene(8);
    const out = guidedFilter(noisy, SIZE, 2, (DENOISE_STRENGTH * 8) ** 2);
    // Columns away from the step: the error is mostly the noise.
    const flatError = (image: Float32Array) => {
      let sum = 0;
      let count = 0;
      for (let y = 0; y < H; y += 1)
        for (const x of [2, 3, 4, 5, 34, 35, 36, 37]) {
          sum += (image[y * W + x] - clean[y * W + x]) ** 2;
          count += 1;
        }
      return Math.sqrt(sum / count);
    };
    expect(flatError(out)).toBeLessThan(flatError(noisy) / 2);
  });

  it('keeps a strong edge: the step stays nearly as high as it was', () => {
    const { noisy } = stepScene(8);
    const out = guidedFilter(noisy, SIZE, 2, (DENOISE_STRENGTH * 8) ** 2);
    const row = 15;
    const left = out[row * W + 17];
    const right = out[row * W + 22];
    expect(right - left).toBeGreaterThan(0.9 * 120);
  });

  it('is the identity for an epsilon of 0 on a noisy image, up to rounding', () => {
    const { noisy } = stepScene(8);
    const out = guidedFilter(noisy, SIZE, 2, 0);
    expect(rmse(out, noisy)).toBeLessThan(1e-2);
  });

  it('is the local mean for a huge epsilon', () => {
    const { noisy } = stepScene(8);
    const smooth = guidedFilter(noisy, SIZE, 2, 1e9);
    expect(rmse(smooth, noisy)).toBeGreaterThan(4);
  });
});

describe('stackedNoise', () => {
  const histogramOf = (deviations: number[]): Uint32Array => {
    const histogram = new Uint32Array(256);
    deviations.forEach((d) => {
      histogram[d] += 1;
    });
    return histogram;
  };

  it('is the median deviation as a sigma, divided by the root of the frame count, with the median penalty', () => {
    const level = stackedNoise(histogramOf([4, 4, 4, 4, 4]), 16);
    expect(level).toBeCloseTo((1.4826 * 4 * 1.25) / 4, 6);
  });

  it('takes the middle of the sampled pixels, not the mean: a minority of movers does not count', () => {
    const level = stackedNoise(histogramOf([2, 2, 2, 2, 200, 200]), 4);
    expect(level).toBeCloseTo((1.4826 * 2 * 1.25) / 2, 6);
  });

  it('is 0 for an empty histogram and for no frames', () => {
    expect(stackedNoise(new Uint32Array(256), 9)).toBe(0);
    expect(stackedNoise(histogramOf([3]), 0)).toBe(0);
  });

  it('takes the lower of the two middle deviations when the samples split evenly', () => {
    const level = stackedNoise(histogramOf([2, 2, 9, 9]), 1);
    expect(level).toBeCloseTo(1.4826 * 2 * 1.25, 6);
  });

  it('is the deviation of the single frame itself for a burst of one', () => {
    expect(stackedNoise(histogramOf([4]), 1)).toBeCloseTo(1.4826 * 4 * 1.25, 6);
  });

  it('falls as frames are added', () => {
    const histogram = histogramOf([6, 6, 6]);
    expect(stackedNoise(histogram, 16)).toBeLessThan(
      stackedNoise(histogram, 4),
    );
  });
});

describe('denoiseRadius', () => {
  it('grows with the picture, from one pixel', () => {
    expect(denoiseRadius(300)).toBe(1);
    expect(denoiseRadius(1500)).toBe(1);
    expect(denoiseRadius(3000)).toBe(2);
    expect(denoiseRadius(6000)).toBe(4);
  });
});

describe('denoiseBanded', () => {
  function layerOf(sigma: number) {
    const { noisy } = stepScene(sigma, 11);
    const data = new Uint8ClampedArray(W * H * 4);
    noisy.forEach((v, i) => {
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    });
    return bandedFromRgba({ ...SIZE, data }, 8);
  }

  it('returns a new image of the same size and band layout, and leaves the input alone', () => {
    const layer = layerOf(8);
    const before = toRgba(layer).data.slice();
    const out = denoiseBanded(layer, 8);
    expect([out.width, out.height, out.bandRows]).toEqual([W, H, 8]);
    expect(out).not.toBe(layer);
    expect([...toRgba(layer).data]).toEqual([...before]);
  });

  it('reaches as far as the long edge asks, however short the other edge', () => {
    // 3000 pixels wide asks for a radius of 2: two box passes spread a bright dot 4 pixels, radius 1 only 2.
    const wide = { width: 3000, height: 5 };
    const data = new Uint8ClampedArray(wide.width * wide.height * 4).fill(255);
    const at = (x: number, y: number) => (y * wide.width + x) * 4;
    for (let i = 0; i < data.length; i += 4) data.fill(0, i, i + 3);
    data.fill(255, at(1500, 2), at(1500, 2) + 3);
    const out = toRgba(denoiseBanded(bandedFromRgba({ ...wide, data }), 1e4));
    expect(out.data[at(1503, 2)]).toBeGreaterThan(0);
    expect(out.data[at(1505, 2)]).toBe(0);
  });

  it('smooths each channel on its own: the noisy red channel gets closer to its truth', () => {
    const { clean } = stepScene(8, 11);
    const layer = layerOf(8);
    const out = toRgba(denoiseBanded(layer, 8));
    const channel = (img: { data: Uint8ClampedArray }) =>
      Float32Array.from({ length: W * H }, (_, i) => img.data[i * 4]);
    expect(rmse(channel(out), clean)).toBeLessThan(
      rmse(channel(toRgba(layer)), clean) * 0.7,
    );
  });
});
