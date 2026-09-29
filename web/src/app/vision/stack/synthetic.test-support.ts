import type { AlignedFrame, Rect, RgbaImage, Size } from '../types';

export type Rgb = readonly [number, number, number];

/** Returns an opaque `size` image filled with `color`. */
export function flatRgba(size: Size, color: Rgb): RgbaImage {
  const data = new Uint8ClampedArray(size.width * size.height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = 255;
  }
  return { width: size.width, height: size.height, data };
}

/** Paints `rect` of `image` with `color`, alpha untouched. */
export function paintRect(image: RgbaImage, rect: Rect, color: Rgb): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
    }
  }
}

/** Returns a coverage mask of `size` that is 1 everywhere. */
export function fullCoverage(size: Size): Uint8Array {
  return new Uint8Array(size.width * size.height).fill(1);
}

/** Returns a coverage mask of `size` that is 1 inside `rect` and 0 outside. */
export function rectCoverage(size: Size, rect: Rect): Uint8Array {
  const coverage = new Uint8Array(size.width * size.height);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    coverage.fill(
      1,
      y * size.width + rect.x,
      y * size.width + rect.x + rect.width,
    );
  }
  return coverage;
}

/** Returns a fully covered aligned frame of `size` filled with `color`. */
export function flatFrame(size: Size, color: Rgb): AlignedFrame {
  return { image: flatRgba(size, color), coverage: fullCoverage(size) };
}

/** Returns true when `rect` lies inside `size` and is non-empty. */
export function isInside(rect: Rect, size: Size): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= size.width &&
    rect.y + rect.height <= size.height
  );
}

/** Returns true when every cell of `rect` in `coverage` is at least `required`. */
export function isRectCovered(
  coverage: Uint8Array,
  size: Size,
  rect: Rect,
  required: number,
): boolean {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (coverage[y * size.width + x] < required) return false;
    }
  }
  return true;
}
