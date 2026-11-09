import type { EffectParams } from '../effects/effectParams';
import { resizeMask } from '../effects/mask';
import { prepareScene, renderScene } from '../effects/render';
import type { GrayImage, RgbaImage, Size } from '../types';

const CHANNELS = 3;
const RGBA = 4;

/** What the movers of a burst are turned into: a soft sweep to the side, which a handful of frames average into a trail. */
export const BURST_BLUR: EffectParams = {
  effect: 'motion',
  strength: 0.5,
  angle: 0,
  grow: 0,
};

/** How many frames of a burst get the effect: it runs at full size, and a few frames make the trail as well as many. */
export const MAX_BLURRED_FRAMES = 6;

/** Running sums of the effect's output, three channels per pixel, for `averageOf`. */
export function emptySum(size: Size): Float32Array {
  return new Float32Array(size.width * size.height * CHANNELS);
}

/**
 * Adds `frame` to `sum` with the movers under `mask` (any size, stretched to the frame's) blurred; a frame with no movers is added as it is.
 * The frame is already aligned to the reference.
 */
export function addBlurredFrame(
  sum: Float32Array,
  frame: { readonly image: RgbaImage; readonly mask: GrayImage },
  params: EffectParams,
): void {
  const { image } = frame;
  const scene = prepareScene(image, resizeMask(frame.mask, image));
  const shown = scene ? renderScene(scene, params) : image;
  const pixels = image.width * image.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    for (let channel = 0; channel < CHANNELS; channel += 1)
      sum[pixel * CHANNELS + channel] += shown.data[pixel * RGBA + channel];
  }
}

/** The mean of the `count` frames added to `sum`, as an opaque image. */
export function averageOf(
  sum: Float32Array,
  count: number,
  size: Size,
): RgbaImage {
  const data = new Uint8ClampedArray(size.width * size.height * RGBA);
  for (let pixel = 0; pixel < size.width * size.height; pixel += 1) {
    for (let channel = 0; channel < CHANNELS; channel += 1)
      data[pixel * RGBA + channel] = Math.round(
        sum[pixel * CHANNELS + channel] / count,
      );
    data[pixel * RGBA + CHANNELS] = 255;
  }
  return { ...size, data };
}
