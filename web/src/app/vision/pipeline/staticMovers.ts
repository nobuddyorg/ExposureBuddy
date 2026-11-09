import { indices } from '../indices';
import { selectMedian } from '../stack/stack';
import type { GrayImage, RgbaImage } from '../types';

const INSIDE = 128;
const CHANNELS = 3;
const RGBA = 4;
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * An area of a mask whose pixels change less than this between the frames, on average (levels 0–255), is a thing that stands still
 * (a statue the model took for a person), not a mover; measured on a crowded square: such areas 9.5, people 29 and up.
 */
export const STATIC_LEVEL = 18;

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

/** The 4-connected areas of `mask`'s set pixels, as one list of pixel indices each. */
function areasOf(mask: GrayImage): number[][] {
  const { width, height, data } = mask;
  const seen = new Uint8Array(data.length);
  const areas: number[][] = [];
  for (const start of indices(data.length)) {
    if (data[start] < INSIDE || seen[start] === 1) continue;
    const area: number[] = [];
    const pending = [start];
    seen[start] = 1;
    while (pending.length > 0) {
      const pixel = pending.pop() as number;
      area.push(pixel);
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (data[next] < INSIDE || seen[next] === 1) continue;
        seen[next] = 1;
        pending.push(next);
      }
    }
    areas.push(area);
  }
  return areas;
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
