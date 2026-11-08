import type { GrayImage, Rect, RgbaImage } from '../types';

export type Rgb = readonly [number, number, number];

export function solidImage(
  width: number,
  height: number,
  color: Rgb,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1)
    data.set([...color, 255], pixel * 4);
  return { width, height, data };
}

/** `image` with `rect` painted `color`. */
export function withRect(image: RgbaImage, rect: Rect, color: Rgb): RgbaImage {
  const data = Uint8ClampedArray.from(image.data);
  for (let y = rect.y; y < rect.y + rect.height; y += 1)
    for (let x = rect.x; x < rect.x + rect.width; x += 1)
      data.set([...color, 255], (y * image.width + x) * 4);
  return { ...image, data };
}

/** A mask that is 255 inside `rect`, 0 elsewhere. */
export function rectMask(width: number, height: number, rect: Rect): GrayImage {
  const data = new Uint8Array(width * height);
  for (let y = rect.y; y < rect.y + rect.height; y += 1)
    for (let x = rect.x; x < rect.x + rect.width; x += 1)
      data[y * width + x] = 255;
  return { width, height, data };
}

export function grayOf(
  width: number,
  height: number,
  values: readonly number[],
): GrayImage {
  return { width, height, data: Uint8Array.from(values) };
}

export function pixelOf(image: RgbaImage, x: number, y: number): number[] {
  return Array.from(
    image.data.subarray(
      (y * image.width + x) * 4,
      (y * image.width + x) * 4 + 4,
    ),
  );
}
