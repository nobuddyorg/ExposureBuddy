import { indices } from '../indices';
import type { GrayImage } from '../types';

/** √(π/2) / 6: turns the mean absolute response of the Laplacian-difference mask below into a standard deviation. */
const IMMERKAER_SCALE = Math.sqrt(Math.PI / 2) / 6;

/** Immerkær's estimate of the sensor noise in grey levels; edges and texture leak in, so it is an upper bound. */
export function noiseLevel(image: GrayImage): number {
  const { width, height, data } = image;
  if (width < 3 || height < 3) return 0;
  let total = 0;
  for (const y of indices(height - 2)) {
    for (const x of indices(width - 2)) {
      const at = (dx: number, dy: number) => data[(y + dy) * width + x + dx];
      total += Math.abs(
        at(0, 0) -
          2 * at(1, 0) +
          at(2, 0) -
          2 * at(0, 1) +
          4 * at(1, 1) -
          2 * at(2, 1) +
          at(0, 2) -
          2 * at(1, 2) +
          at(2, 2),
      );
    }
  }
  return (IMMERKAER_SCALE * total) / ((width - 2) * (height - 2));
}

/** Below this noise level the features are found on the photo as it is: smoothing would only cost accuracy. */
export const CLEAN_NOISE = 3;
/** From this noise level on, the heaviest smoothing: a night burst, where unsmoothed corners are mostly noise. */
export const NOISY_NOISE = 10;

/** How far to box-blur a grey copy before looking for features in it, from its noise level: 0, 1 or 2 pixels. */
export function denoiseRadius(noise: number): number {
  if (noise < CLEAN_NOISE) return 0;
  return noise < NOISY_NOISE ? 1 : 2;
}
