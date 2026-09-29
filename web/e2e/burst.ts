import { readFileSync } from 'node:fs';

import { fixturePath } from './helpers';
import { type DecodedPng, decodePng } from './png';

/** The camera shake of one frame: `frame = center + scale · rotate(angle) · (scene − center) + (tx, ty)`, angle in radians. */
export interface Similarity {
  readonly angle: number;
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

/** Pixel-aligned rectangle with exclusive far edges. */
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What make-fixtures.mjs records beside a burst in meta.json. */
export interface BurstMeta {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly referenceIndex: number;
  readonly roadBand: Rect;
  readonly frames: readonly {
    readonly file: string;
    readonly transform: Similarity;
    readonly gain: number;
  }[];
}

const CHANNELS = 4;
// Keeps the band clear of the resampled edge pixels on both sides of the comparison.
const BAND_INSET = 3;
// Every fourth pixel in x and y is plenty to pin a crop offset on a textured scene.
const OFFSET_SEARCH_STEP = 4;

/** The meta.json of a generated burst. */
export function readBurstMeta(name: string): BurstMeta {
  return JSON.parse(
    readFileSync(fixturePath(`${name}/meta.json`), 'utf8'),
  ) as BurstMeta;
}

/** A generated PNG decoded to RGBA. */
export function readFixturePng(name: string): DecodedPng {
  return decodePng(readFileSync(fixturePath(name)));
}

/** `scene` seen through `transform` at `gain`, resampled exactly as make-fixtures.mjs renders a frame (bilinear, edges replicated). */
export function renderThroughTransform(
  scene: DecodedPng,
  transform: Similarity,
  gain: number,
): DecodedPng {
  const { width, height } = scene;
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  const cosine = Math.cos(-transform.angle) / transform.scale;
  const sine = Math.sin(-transform.angle) / transform.scale;
  const centerX = width / 2;
  const centerY = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX - transform.tx;
      const dy = y - centerY - transform.ty;
      const sourceX = centerX + cosine * dx - sine * dy;
      const sourceY = centerY + sine * dx + cosine * dy;
      const x0 = Math.max(0, Math.min(width - 2, Math.floor(sourceX)));
      const y0 = Math.max(0, Math.min(height - 2, Math.floor(sourceY)));
      const fx = Math.max(0, Math.min(1, sourceX - x0));
      const fy = Math.max(0, Math.min(1, sourceY - y0));
      const topLeft = (y0 * width + x0) * CHANNELS;
      const target = (y * width + x) * CHANNELS;
      for (let channel = 0; channel < 3; channel += 1) {
        const top =
          scene.data[topLeft + channel] * (1 - fx) +
          scene.data[topLeft + CHANNELS + channel] * fx;
        const bottom =
          scene.data[topLeft + width * CHANNELS + channel] * (1 - fx) +
          scene.data[topLeft + (width + 1) * CHANNELS + channel] * fx;
        data[target + channel] = Math.round(
          (top * (1 - fy) + bottom * fy) * gain,
        );
      }
      data[target + 3] = 255;
    }
  }
  return { width, height, data };
}

/** The largest axis-aligned rectangle inside `rect` as `transform` moves it, inset by a few pixels. */
function mapRectThroughTransform(
  rect: Rect,
  transform: Similarity,
  size: { readonly width: number; readonly height: number },
): Rect {
  const cosine = Math.cos(transform.angle) * transform.scale;
  const sine = Math.sin(transform.angle) * transform.scale;
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height],
    [rect.x + rect.width, rect.y + rect.height],
  ].map(([x, y]) => ({
    x: centerX + cosine * (x - centerX) - sine * (y - centerY) + transform.tx,
    y: centerY + sine * (x - centerX) + cosine * (y - centerY) + transform.ty,
  }));
  const xs = corners.map((corner) => corner.x).sort((a, b) => a - b);
  const ys = corners.map((corner) => corner.y).sort((a, b) => a - b);
  // The second-smallest and second-largest coordinates bound the inscribed rectangle of a rotated one.
  const left = Math.ceil(xs[1]) + BAND_INSET;
  const top = Math.ceil(ys[1]) + BAND_INSET;
  const right = Math.floor(xs[2]) - BAND_INSET;
  const bottom = Math.floor(ys[2]) - BAND_INSET;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Mean absolute RGB difference between `first` at `firstOrigin` and `second` at `secondOrigin` over a `size`-sized window. */
export function meanAbsoluteDifference(
  first: DecodedPng,
  firstOrigin: { readonly x: number; readonly y: number },
  second: DecodedPng,
  secondOrigin: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  step = 1,
): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < size.height; y += step) {
    for (let x = 0; x < size.width; x += step) {
      const a =
        ((firstOrigin.y + y) * first.width + firstOrigin.x + x) * CHANNELS;
      const b =
        ((secondOrigin.y + y) * second.width + secondOrigin.x + x) * CHANNELS;
      sum +=
        Math.abs(first.data[a] - second.data[b]) +
        Math.abs(first.data[a + 1] - second.data[b + 1]) +
        Math.abs(first.data[a + 2] - second.data[b + 2]);
      count += 3;
    }
  }
  return count === 0 ? Number.NaN : sum / count;
}

/** Where `crop` sits inside `frame`: the offset with the smallest subsampled difference; the crop must fit the frame. */
export function locateCrop(
  crop: DecodedPng,
  frame: DecodedPng,
): { readonly x: number; readonly y: number } {
  if (crop.width > frame.width || crop.height > frame.height) {
    throw new Error(
      `crop ${crop.width}×${crop.height} is larger than the frame ${frame.width}×${frame.height}`,
    );
  }
  let best = { x: 0, y: 0 };
  let bestDifference = Number.POSITIVE_INFINITY;
  const origin = { x: 0, y: 0 };
  for (let y = 0; y <= frame.height - crop.height; y += 1) {
    for (let x = 0; x <= frame.width - crop.width; x += 1) {
      const difference = meanAbsoluteDifference(
        crop,
        origin,
        frame,
        { x, y },
        crop,
        OFFSET_SEARCH_STEP,
      );
      if (difference < bestDifference) {
        bestDifference = difference;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Where to compare a crop of the reference frame with the walker's band: both origins and one size, clipped to both images. */
export function comparisonWindow(
  meta: BurstMeta,
  cropOrigin: { readonly x: number; readonly y: number },
  cropSize: { readonly width: number; readonly height: number },
): {
  readonly cropWindow: { readonly x: number; readonly y: number };
  readonly frameWindow: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
} {
  const reference = meta.frames[meta.referenceIndex];
  const band = mapRectThroughTransform(
    meta.roadBand,
    reference.transform,
    meta,
  );
  const left = Math.max(band.x, cropOrigin.x);
  const top = Math.max(band.y, cropOrigin.y);
  const right = Math.min(band.x + band.width, cropOrigin.x + cropSize.width);
  const bottom = Math.min(band.y + band.height, cropOrigin.y + cropSize.height);
  return {
    cropWindow: { x: left - cropOrigin.x, y: top - cropOrigin.y },
    frameWindow: { x: left, y: top },
    size: { width: right - left, height: bottom - top },
  };
}
