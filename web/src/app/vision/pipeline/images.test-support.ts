import type { GrayImage, RgbaImage } from '../types';

/** `gray` as an opaque RGBA image with equal channels. */
export function toRgba(gray: GrayImage): RgbaImage {
  const data = new Uint8ClampedArray(gray.width * gray.height * 4);
  for (let index = 0; index < gray.data.length; index += 1) {
    data[index * 4] = gray.data[index];
    data[index * 4 + 1] = gray.data[index];
    data[index * 4 + 2] = gray.data[index];
    data[index * 4 + 3] = 255;
  }
  return { width: gray.width, height: gray.height, data };
}
