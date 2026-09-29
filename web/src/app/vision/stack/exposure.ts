import type { RgbaImage } from '../types';

const UNIT_GAIN: readonly [number, number, number] = [1, 1, 1];
const MIN_GAIN = 0.5;
const MAX_GAIN = 2;
const SAMPLE_STRIDE = 4;
const CHANNELS = 4;

/** Returns the per-channel factor (referenceMean / frameMean over the covered pixels, sampled every 4th in x and y) clamped to [0.5, 2]; [1, 1, 1] without overlap or when a channel mean is 0. */
export function estimateGain(
  frame: RgbaImage,
  reference: RgbaImage,
  coverage: Uint8Array,
): readonly [number, number, number] {
  const { width, height } = frame;
  const frameData = frame.data;
  const referenceData = reference.data;
  const frameSums = [0, 0, 0];
  const referenceSums = [0, 0, 0];
  for (let y = 0; y < height; y += SAMPLE_STRIDE) {
    for (let x = 0; x < width; x += SAMPLE_STRIDE) {
      const pixel = y * width + x;
      if (coverage[pixel] !== 1) continue;
      const offset = pixel * CHANNELS;
      frameSums[0] += frameData[offset];
      frameSums[1] += frameData[offset + 1];
      frameSums[2] += frameData[offset + 2];
      referenceSums[0] += referenceData[offset];
      referenceSums[1] += referenceData[offset + 1];
      referenceSums[2] += referenceData[offset + 2];
    }
  }
  // No overlap leaves every sum at 0, so it is one case of the empty channel.
  const hasEmptyChannel = frameSums
    .concat(referenceSums)
    .some((sum) => sum === 0);
  if (hasEmptyChannel) return UNIT_GAIN;
  return [
    clampGain(referenceSums[0] / frameSums[0]),
    clampGain(referenceSums[1] / frameSums[1]),
    clampGain(referenceSums[2] / frameSums[2]),
  ];
}

function clampGain(ratio: number): number {
  return Math.min(MAX_GAIN, Math.max(MIN_GAIN, ratio));
}

/** Multiplies the RGB of every pixel with coverage 1 by `gain` in place, rounded and clamped to 255; alpha untouched. */
export function applyGain(
  frame: RgbaImage,
  gain: readonly [number, number, number],
  coverage: Uint8Array,
): void {
  const redTable = gainTable(gain[0]);
  const greenTable = gainTable(gain[1]);
  const blueTable = gainTable(gain[2]);
  const { data } = frame;
  coverage.forEach((covered, pixel) => {
    if (covered !== 1) return;
    const offset = pixel * CHANNELS;
    data[offset] = redTable[data[offset]];
    data[offset + 1] = greenTable[data[offset + 1]];
    data[offset + 2] = blueTable[data[offset + 2]];
  });
}

// Uint8ClampedArray rounds and clamps on assignment, so the table holds the whole transfer curve.
function gainTable(gain: number): Uint8ClampedArray {
  return Uint8ClampedArray.from({ length: 256 }, (_, value) =>
    Math.round(value * gain),
  );
}
