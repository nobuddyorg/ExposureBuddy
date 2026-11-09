import { boxBlurGray } from '../image/blur';
import { indices } from '../indices';
import type { GrayImage, Rect, Size } from '../types';

const INSIDE = 255;
const HALF = 128;

/** A mask that is 255 where the segmenter's category map says one of `wanted`, 0 elsewhere. */
export function maskFromAnyCategory(
  categories: Uint8Array,
  size: Size,
  wanted: ReadonlySet<number>,
): GrayImage {
  if (categories.length !== size.width * size.height)
    throw new RangeError(
      `${categories.length} categories for a ${size.width} × ${size.height} image.`,
    );
  return {
    ...size,
    data: Uint8Array.from(categories, (category) =>
      wanted.has(category) ? INSIDE : 0,
    ),
  };
}

/** A mask that is 255 where the segmenter's category map says `personCategory`, 0 elsewhere. */
export function maskFromCategories(
  categories: Uint8Array,
  size: Size,
  personCategory: number,
): GrayImage {
  return maskFromAnyCategory(categories, size, new Set([personCategory]));
}

/** The share of pixels, 0–1, that are more inside the mask than out. */
export function maskCoverage(mask: GrayImage): number {
  const inside = mask.data.reduce(
    (count, value) => count + (value >= HALF ? 1 : 0),
    0,
  );
  return inside / mask.data.length;
}

/** Grows every set area by `radius` pixels (a square structuring element), as two separable maximum passes. */
export function dilateMask(mask: GrayImage, radius: number): GrayImage {
  const { width, height } = mask;
  const alongRows = new Uint8Array(mask.data.length);
  for (const y of indices(height)) {
    for (const x of indices(width)) {
      let largest = 0;
      for (
        let k = Math.max(0, x - radius);
        k <= Math.min(width - 1, x + radius);
        k += 1
      )
        largest = Math.max(largest, mask.data[y * width + k]);
      alongRows[y * width + x] = largest;
    }
  }
  const grown = new Uint8Array(mask.data.length);
  for (const x of indices(width)) {
    for (const y of indices(height)) {
      let largest = 0;
      for (
        let k = Math.max(0, y - radius);
        k <= Math.min(height - 1, y + radius);
        k += 1
      )
        largest = Math.max(largest, alongRows[k * width + x]);
      grown[y * width + x] = largest;
    }
  }
  return { width, height, data: grown };
}

/** `mask` stretched to `size` with bilinear interpolation, so a coarse mask gets soft edges at the size it is used at. */
export function resizeMask(mask: GrayImage, size: Size): GrayImage {
  const data = new Uint8Array(size.width * size.height);
  const stepX = mask.width / size.width;
  const stepY = mask.height / size.height;
  for (const y of indices(size.height)) {
    const sourceY = Math.min(
      mask.height - 1,
      Math.max(0, (y + 0.5) * stepY - 0.5),
    );
    const top = Math.floor(sourceY);
    const bottom = Math.min(mask.height - 1, top + 1);
    const fractionY = sourceY - top;
    for (const x of indices(size.width)) {
      const sourceX = Math.min(
        mask.width - 1,
        Math.max(0, (x + 0.5) * stepX - 0.5),
      );
      const left = Math.floor(sourceX);
      const right = Math.min(mask.width - 1, left + 1);
      const fractionX = sourceX - left;
      const upper =
        mask.data[top * mask.width + left] * (1 - fractionX) +
        mask.data[top * mask.width + right] * fractionX;
      const lower =
        mask.data[bottom * mask.width + left] * (1 - fractionX) +
        mask.data[bottom * mask.width + right] * fractionX;
      data[y * size.width + x] = Math.round(
        upper * (1 - fractionY) + lower * fractionY,
      );
    }
  }
  return { ...size, data };
}

/** Softens the edge of `mask` over about `radius` pixels: two box blurs, which approximate a Gaussian. */
export function featherMask(mask: GrayImage, radius: number): GrayImage {
  return boxBlurGray(boxBlurGray(mask, radius), radius);
}

/** The smallest rectangle holding every non-zero pixel, grown by `margin` and kept inside the image; null for an empty mask. */
export function maskBounds(mask: GrayImage, margin: number): Rect | null {
  const { width, height, data } = mask;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (const y of indices(height)) {
    for (const x of indices(width)) {
      if (data[y * width + x] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) return null;
  return growRect(
    { x: left, y: top, width: right - left + 1, height: bottom - top + 1 },
    margin,
    { width, height },
  );
}

/** `rect` grown by `margin` on every side, kept inside a `bounds`-sized image. */
export function growRect(rect: Rect, margin: number, bounds: Size): Rect {
  const left = Math.max(0, rect.x - margin);
  const top = Math.max(0, rect.y - margin);
  const right = Math.min(bounds.width, rect.x + rect.width + margin);
  const bottom = Math.min(bounds.height, rect.y + rect.height + margin);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
