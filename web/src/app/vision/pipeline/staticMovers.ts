import { indices } from '../indices';
import { selectMedian } from '../stack/stack';
import { areasOf } from './areas';
import type { GrayImage, RgbaImage } from '../types';

const CHANNELS = 3;
const RGBA = 4;

/**
 * An area of a mask whose pixels change less than this between the frames, on average (levels 0–255), is a thing that stands still
 * (a statue the model took for a person), not a mover; measured on a crowded square: such areas 9.5, people 29 and up.
 */
export const STATIC_LEVEL = 18;

/**
 * A still area whose pixels change less than this is a statue or a relief (never blurred, however the people who stand about are treated);
 * measured on the 14-frame series of a Gothic facade: its statues 5.9 to 12.1, walking people 33 and up.
 */
export const STATUE_LEVEL = 14;

/** Areas of fewer pixels than this are not judged: their average says too little. */
export const MIN_JUDGED_AREA = 200;

/** Per pixel, the mean over frames and channels of how far a frame is from the per-pixel median of all frames (levels 0–255). */
export function temporalDeviation(frames: readonly RgbaImage[]): Float32Array {
  const [first] = frames;
  const pixels = first ? first.width * first.height : 0;
  const deviation = new Float32Array(pixels);
  const samples = new Uint8Array(frames.length);
  for (const pixel of indices(pixels)) {
    let sum = 0;
    for (const channel of indices(CHANNELS)) {
      frames.forEach((frame, index) => {
        samples[index] = frame.data[pixel * RGBA + channel];
      });
      const median = selectMedian(samples, frames.length);
      // The selection only reorders the samples, and the sum does not care about order.
      samples.forEach((value) => {
        sum += Math.abs(value - median);
      });
    }
    deviation[pixel] = sum / (CHANNELS * frames.length);
  }
  return deviation;
}

/** `mask` without the areas that stand still: those of at least MIN_JUDGED_AREA pixels whose mean `deviation` is below `level`. */
export function withoutStaticAreas(
  mask: GrayImage,
  deviation: Float32Array,
  level = STATIC_LEVEL,
): GrayImage {
  const data = Uint8Array.from(mask.data);
  for (const area of areasOf(mask)) {
    if (area.length < MIN_JUDGED_AREA) continue;
    const mean =
      area.reduce((sum, pixel) => sum + deviation[pixel], 0) / area.length;
    if (mean >= level) continue;
    for (const pixel of area) data[pixel] = 0;
  }
  return { width: mask.width, height: mask.height, data };
}

/** The areas of `mask` that stand about like people do: judged, still, but with a little more life in them than a statue has. */
export function standingAreas(
  mask: GrayImage,
  deviation: Float32Array,
): GrayImage {
  const data = new Uint8Array(mask.data.length);
  for (const area of areasOf(mask)) {
    if (area.length < MIN_JUDGED_AREA) continue;
    const mean =
      area.reduce((sum, pixel) => sum + deviation[pixel], 0) / area.length;
    if (mean < STATUE_LEVEL || mean >= STATIC_LEVEL) continue;
    for (const pixel of area) data[pixel] = mask.data[pixel];
  }
  return { width: mask.width, height: mask.height, data };
}
