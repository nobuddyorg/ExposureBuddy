import type { GrayImage, RgbaImage } from '../types';

// Rec. 601 luma weights scaled by 1000; they sum to exactly 1000, so 255 white stays 255.
const RED_WEIGHT = 299;
const GREEN_WEIGHT = 587;
const BLUE_WEIGHT = 114;
const WEIGHT_SCALE = 1000;
const ROUNDING_OFFSET = WEIGHT_SCALE / 2;

/** Returns the Rec. 601 luma of `image` as an 8-bit gray image of the same size, rounded to nearest. */
export function rgbaToGray(image: RgbaImage): GrayImage {
  const { width, height, data } = image;
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);
  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel += 1, offset += 4) {
    const weighted =
      RED_WEIGHT * data[offset] +
      GREEN_WEIGHT * data[offset + 1] +
      BLUE_WEIGHT * data[offset + 2] +
      ROUNDING_OFFSET;
    gray[pixel] = (weighted / WEIGHT_SCALE) | 0;
  }
  return { width, height, data: gray };
}
