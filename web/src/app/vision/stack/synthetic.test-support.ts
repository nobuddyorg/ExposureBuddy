import { createBandedRgb, rowOf } from '../image/banded';
import { emptyStack, stackRows } from './stack';
import type {
  AlignedFrame,
  BandedRgb,
  Rect,
  RowSpans,
  Size,
  StackResult,
} from '../types';

export type Rgb = readonly [number, number, number];

/** Returns a banded `size` image filled with `color`. */
export function flatBanded(
  size: Size,
  color: Rgb,
  bandRows?: number,
): BandedRgb {
  const image = createBandedRgb(size, bandRows);
  paintRect(image, { x: 0, y: 0, ...size }, color);
  return image;
}

/** Paints `rect` of `image` with `color`. */
export function paintRect(image: BandedRgb, rect: Rect, color: Rgb): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    const row = rowOf(image, y);
    for (let x = rect.x; x < rect.x + rect.width; x += 1) row.set(color, x * 3);
  }
}

/** The RGB of pixel (x, y). */
export function pixelOf(image: BandedRgb, x: number, y: number): number[] {
  return Array.from(rowOf(image, y).subarray(x * 3, x * 3 + 3));
}

/** Every row of `image` concatenated: the pixels in order, 3 bytes each. */
export function allPixels(image: BandedRgb): number[] {
  return Array.from({ length: image.height }, (_, y) =>
    Array.from(rowOf(image, y)),
  ).flat();
}

/** Spans that cover every column of every row. */
export function fullSpans(size: Size): RowSpans {
  return rectSpans(size, { x: 0, y: 0, ...size });
}

/** Spans that cover `rect` and nothing else. */
export function rectSpans(size: Size, rect: Rect): RowSpans {
  const start = new Int32Array(size.height).fill(size.width);
  const end = new Int32Array(size.height);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    start[y] = rect.x;
    end[y] = rect.x + rect.width;
  }
  return { start, end };
}

/** Returns a fully covered aligned frame of `size` filled with `color`. */
export function flatFrame(
  size: Size,
  color: Rgb,
  bandRows?: number,
): AlignedFrame {
  return { image: flatBanded(size, color, bandRows), spans: fullSpans(size) };
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

/** Returns true when every one of `spans` covers every cell of `rect`. */
export function isRectCovered(spans: readonly RowSpans[], rect: Rect): boolean {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (const row of spans) {
      if (row.start[y] > rect.x || row.end[y] < rect.x + rect.width)
        return false;
    }
  }
  return true;
}

/** Every row of `rect` stacked in one go, as a single-pass run does. */
export function stackFrames(
  frames: readonly AlignedFrame[],
  options: {
    readonly rect: Rect;
    readonly onProgress?: (fraction: number) => void;
  },
): StackResult {
  const stack = emptyStack(options.rect, frames.length);
  stackRows(frames, stack, {
    ...options,
    rows: { start: 0, end: options.rect.y + options.rect.height },
  });
  return stack;
}
