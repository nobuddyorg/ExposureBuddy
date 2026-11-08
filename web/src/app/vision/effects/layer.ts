import { indices } from '../indices';
import type { GrayImage, Rect, RgbaImage } from '../types';

/**
 * Premultiplied RGBA as floats, four per pixel, all on the 0–255 scale: colour already multiplied by coverage.
 * It is the people lifted off the photo; whatever blurs or moves them can be laid over the plate again.
 */
export interface Layer {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

export function emptyLayer(width: number, height: number): Layer {
  return { width, height, data: new Float32Array(width * height * 4) };
}

/** `image` where `coverage` says so: colour scaled by coverage, coverage kept as alpha. */
export function liftLayer(image: RgbaImage, coverage: GrayImage): Layer {
  const layer = emptyLayer(image.width, image.height);
  for (const pixel of indices(image.width * image.height)) {
    const alpha = coverage.data[pixel];
    const scale = alpha / 255;
    for (const channel of [0, 1, 2])
      layer.data[pixel * 4 + channel] = image.data[pixel * 4 + channel] * scale;
    layer.data[pixel * 4 + 3] = alpha;
  }
  return layer;
}

/** `layer` laid over `plate` inside `region`; outside it the plate is returned as it is. The result is opaque. */
export function composeOver(
  plate: RgbaImage,
  layer: Layer,
  region: Rect,
): RgbaImage {
  const data = Uint8ClampedArray.from(plate.data);
  for (const y of indices(region.height)) {
    for (const x of indices(region.width)) {
      const offset = ((region.y + y) * plate.width + region.x + x) * 4;
      const behind = 1 - layer.data[offset + 3] / 255;
      for (const channel of [0, 1, 2])
        data[offset + channel] =
          layer.data[offset + channel] + plate.data[offset + channel] * behind;
      data[offset + 3] = 255;
    }
  }
  return { width: plate.width, height: plate.height, data };
}

/** `from` and `to` mixed per pixel: `from` where the mask is 0, `to` where it is 255. */
export function mixByMask(
  from: RgbaImage,
  to: RgbaImage,
  mask: GrayImage,
): RgbaImage {
  const data = Uint8ClampedArray.from(from.data);
  for (const pixel of indices(from.width * from.height)) {
    const weight = mask.data[pixel] / 255;
    for (const channel of [0, 1, 2]) {
      const offset = pixel * 4 + channel;
      data[offset] =
        from.data[offset] * (1 - weight) + to.data[offset] * weight;
    }
  }
  return { width: from.width, height: from.height, data };
}
