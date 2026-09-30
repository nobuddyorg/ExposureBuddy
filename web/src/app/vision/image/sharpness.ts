import type { GrayImage } from '../types';

/** The sum of the squared deviations of `values` from their mean; the count cancels in a ratio of two. */
function squaredDeviations(values: Int16Array): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
}

/**
 * How crisp `image` is: the variance of the 4-neighbour Laplacian over the interior, divided by the variance of the pixels there.
 * Motion or focus blur flattens the Laplacian far more than the pixels, and the ratio ignores exposure: scaling the pixels scales
 * both variances alike. 0 for an image without interior or without contrast.
 */
export function sharpness(image: GrayImage): number {
  const { width, height, data } = image;
  const interiorWidth = Math.max(0, width - 2);
  const interiorHeight = Math.max(0, height - 2);
  const pixels = new Int16Array(interiorWidth * interiorHeight);
  const laplacians = new Int16Array(pixels.length);
  pixels.forEach((_, index) => {
    const at =
      (Math.floor(index / interiorWidth) + 1) * width +
      (index % interiorWidth) +
      1;
    pixels[index] = data[at];
    laplacians[index] =
      data[at - 1] +
      data[at + 1] +
      data[at - width] +
      data[at + width] -
      4 * data[at];
  });
  const pixelSpread = squaredDeviations(pixels);
  // An empty interior has no deviations to sum, so it lands here too.
  if (pixelSpread === 0) return 0;
  return squaredDeviations(laplacians) / pixelSpread;
}
