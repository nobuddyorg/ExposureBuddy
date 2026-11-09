import { indices } from '../indices';
import { createBandedRgb, rowOf } from '../image/banded';
import type { BandedRgb, Size } from '../types';
import { boxBlurInPlace } from './boxBlur';

const RGB = 3;
const MAD_TO_SIGMA = 1.4826;
// A median of several noisy samples is noisier than their mean by about this factor.
const MEDIAN_PENALTY = 1.25;

/** Noise left in the long exposure, in levels, from which it is smoothed; below it the result is left exactly as stacked. */
export const DENOISE_FROM = 1.5;

/** How many noise levels of detail the smoothing may remove: the guided filter's regularisation is (this × noise)². */
export const DENOISE_STRENGTH = 1.5;

/**
 * The noise a burst of `frameCount` frames leaves in its stacked result, in 8-bit levels, from the histogram of the median absolute
 * deviations of a sample of its pixels (stackRows' `noise`): the typical deviation is the noise of one frame, and stacking divides it by
 * the square root of the frame count (times a penalty for the median). Zero for an empty histogram.
 */
export function stackedNoise(
  histogram: Uint32Array,
  frameCount: number,
): number {
  const total = histogram.reduce((sum, count) => sum + count, 0);
  if (total === 0 || frameCount < 1) return 0;
  let seen = 0;
  let deviation = 0;
  for (const level of indices(histogram.length)) {
    seen += histogram[level];
    if (seen * 2 >= total) {
      deviation = level;
      break;
    }
  }
  return (MAD_TO_SIGMA * deviation * MEDIAN_PENALTY) / Math.sqrt(frameCount);
}

/** How far the smoothing reaches, in pixels, for an image with this long edge: a pixel of noise grain grows with the picture. */
export function denoiseRadius(longEdge: number): number {
  return Math.max(1, Math.round(longEdge / 1500));
}

/**
 * The guided filter of He et al., the channel guiding itself: flat areas become their local mean, edges and texture stronger than
 * `√epsilon` stay. One box filter is a mean over a (2·radius + 1)² window.
 */
export function guidedFilter(
  channel: Float32Array,
  size: Size,
  radius: number,
  epsilon: number,
): Float32Array {
  const mean = Float32Array.from(channel);
  const meanSquare = channel.map((value) => value * value);
  boxBlurInPlace(mean, size, radius, 1);
  boxBlurInPlace(meanSquare, size, radius, 1);
  const slope = new Float32Array(channel.length);
  const offset = new Float32Array(channel.length);
  for (const pixel of indices(channel.length)) {
    const variance = Math.max(0, meanSquare[pixel] - mean[pixel] * mean[pixel]);
    slope[pixel] = variance / (variance + epsilon);
    offset[pixel] = mean[pixel] - slope[pixel] * mean[pixel];
  }
  boxBlurInPlace(slope, size, radius, 1);
  boxBlurInPlace(offset, size, radius, 1);
  return slope.map((a, pixel) => a * channel[pixel] + offset[pixel]);
}

/** `layer` with each colour channel smoothed by `guidedFilter` for noise of `noise` levels; a new image, the input is untouched. */
export function denoiseBanded(layer: BandedRgb, noise: number): BandedRgb {
  const size = { width: layer.width, height: layer.height };
  const radius = denoiseRadius(Math.max(size.width, size.height));
  const epsilon = (DENOISE_STRENGTH * noise) ** 2;
  const result = createBandedRgb(size, layer.bandRows);
  for (const channel of indices(RGB)) {
    const values = new Float32Array(size.width * size.height);
    for (const y of indices(size.height)) {
      const row = rowOf(layer, y);
      for (const x of indices(size.width))
        values[y * size.width + x] = row[x * RGB + channel];
    }
    const smooth = guidedFilter(values, size, radius, epsilon);
    for (const y of indices(size.height)) {
      const row = rowOf(result, y);
      for (const x of indices(size.width))
        row[x * RGB + channel] = smooth[y * size.width + x];
    }
  }
  return result;
}
