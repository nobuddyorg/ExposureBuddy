import { indices } from '../indices';
import type { GrayImage, RgbaImage, Size } from '../types';

const CHANNELS = 3;
const RGBA = 4;
const OPAQUE = 255;

/** Copies of a pixel along its path: past this a longer path is covered more thinly, not with more cost. */
export const MAX_STAMPS = 600;

/** What the smeared movers of several frames add up to: premultiplied colour (levels × coverage) and coverage (0–1), per pixel. */
export interface SmearSum {
  readonly width: number;
  readonly height: number;
  readonly colour: Float32Array;
  readonly coverage: Float32Array;
}

/** Where a mover goes while the shutter is open: from where it is by `dx`, `dy` pixels, or that far around where it is. */
export interface Path {
  readonly dx: number;
  readonly dy: number;
  readonly centred: boolean;
}

export function emptySmearSum(size: Size): SmearSum {
  const pixels = size.width * size.height;
  return {
    ...size,
    colour: new Float32Array(pixels * CHANNELS),
    coverage: new Float32Array(pixels),
  };
}

/**
 * Adds the part of `frame` under `weight` (0 is none, 255 is all of it; the frame's size) to `sum`, spread evenly along `path`:
 * the mover as a streak, as a long exposure would have drawn it, with the weight as the streak's opacity.
 */
export function addSmear(
  sum: SmearSum,
  frame: RgbaImage,
  weight: GrayImage,
  path: Path,
): void {
  const stamps = Math.min(
    MAX_STAMPS,
    Math.max(1, Math.ceil(Math.hypot(path.dx, path.dy)) + 1),
  );
  const each = 1 / stamps;
  const origin = path.centred ? -0.5 : 0;
  const offsets = indices(stamps).map((stamp) => {
    const along = stamps === 1 ? 0 : stamp / (stamps - 1) + origin;
    return {
      x: Math.round(along * path.dx),
      y: Math.round(along * path.dy),
    };
  });
  for (const pixel of indices(weight.data.length)) {
    const covered = weight.data[pixel] / OPAQUE;
    if (covered === 0) continue;
    const x = pixel % sum.width;
    const y = Math.floor(pixel / sum.width);
    for (const offset of offsets) {
      const tx = x + offset.x;
      const ty = y + offset.y;
      if (tx < 0 || tx >= sum.width || ty < 0 || ty >= sum.height) continue;
      const target = ty * sum.width + tx;
      sum.coverage[target] += covered * each;
      for (let channel = 0; channel < CHANNELS; channel += 1)
        sum.colour[target * CHANNELS + channel] +=
          frame.data[pixel * RGBA + channel] * covered * each;
    }
  }
}
