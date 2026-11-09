import { indices } from '../indices';
import type { GrayImage, Rect, RgbaImage, Size } from '../types';

/** The segmenter sees every region at this side length, so a region smaller than it is only enlarged, never resolved better. */
export const MODEL_SIDE = 256;
/** A tile is this share of the photo's shorter side: small enough that a person in the crowd fills a few model pixels, large enough to keep whole bodies. */
const TILE_SHARE = 0.3;

/** Start positions along one axis that cover `length` (longer than `window`) with windows of `window`, half a window apart, the last flush with the end. */
function starts(length: number, window: number): number[] {
  const steps = Math.ceil((length - window) / (window / 2));
  return indices(steps + 1).map((step) =>
    Math.round((step * (length - window)) / steps),
  );
}

/** The whole photo first, then overlapping square tiles over it; a photo no larger than one tile is just the whole. */
export function segmentationTiles(size: Size): Rect[] {
  const side = Math.max(
    MODEL_SIDE,
    Math.round(Math.min(size.width, size.height) * TILE_SHARE),
  );
  const whole = { x: 0, y: 0, ...size };
  if (side >= Math.min(size.width, size.height)) return [whole];
  const tiles = starts(size.height, side).flatMap((y) =>
    starts(size.width, side).map((x) => ({ x, y, width: side, height: side })),
  );
  return [whole, ...tiles];
}

/** The pixels of `image` inside `rect`, as an image of their own. */
export function cropImage(image: RgbaImage, rect: Rect): RgbaImage {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (const row of indices(rect.height)) {
    const from = ((rect.y + row) * image.width + rect.x) * 4;
    data.set(
      image.data.subarray(from, from + rect.width * 4),
      row * rect.width * 4,
    );
  }
  return { width: rect.width, height: rect.height, data };
}

/** Raises `target` to at least `part` wherever the tile at `origin` has people: a person any tile found stays found. */
export function mergeTileMask(
  target: GrayImage,
  part: GrayImage,
  origin: Rect,
): void {
  for (const row of indices(part.height)) {
    for (const column of indices(part.width)) {
      const at = (origin.y + row) * target.width + origin.x + column;
      target.data[at] = Math.max(
        target.data[at],
        part.data[row * part.width + column],
      );
    }
  }
}
