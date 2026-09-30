import { rowOf } from '../image/banded';
import type { AlignedFrame, BandedRgb, RowRange } from '../types';
import { indices } from '../indices';

/** A factor per colour channel. */
export type Gain = readonly [number, number, number];

const UNIT_GAIN: Gain = [1, 1, 1];
const MIN_GAIN = 0.5;
const MAX_GAIN = 2;
const SAMPLE_STRIDE = 4;
const RGB = 3;

/** The first multiple of the sample stride at or after `x`. */
function firstSample(x: number): number {
  return Math.ceil(x / SAMPLE_STRIDE) * SAMPLE_STRIDE;
}

/** Returns the per-channel factor (referenceMean / frameMean over the covered pixels, sampled every 4th in x and y) clamped to [0.5, 2]; [1, 1, 1] without overlap or when a channel mean is 0. */
export function estimateGain(frame: AlignedFrame, reference: BandedRgb): Gain {
  const { start, end } = frame.spans;
  const frameSums = [0, 0, 0];
  const referenceSums = [0, 0, 0];
  for (const y of indices(frame.image.height, SAMPLE_STRIDE)) {
    const frameRow = rowOf(frame.image, y);
    const referenceRow = rowOf(reference, y);
    for (let x = firstSample(start[y]); x < end[y]; x += SAMPLE_STRIDE) {
      const offset = x * RGB;
      frameSums[0] += frameRow[offset];
      frameSums[1] += frameRow[offset + 1];
      frameSums[2] += frameRow[offset + 2];
      referenceSums[0] += referenceRow[offset];
      referenceSums[1] += referenceRow[offset + 1];
      referenceSums[2] += referenceRow[offset + 2];
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

/** Multiplies the RGB of every covered pixel of `frame` in `rows` (all by default) by `gain` in place, rounded and clamped to 255. */
export function applyGain(
  frame: AlignedFrame,
  gain: Gain,
  rows: RowRange = { start: 0, end: frame.image.height },
): void {
  const tables = [gainTable(gain[0]), gainTable(gain[1]), gainTable(gain[2])];
  const { start, end } = frame.spans;
  for (let y = rows.start; y < rows.end; y += 1) {
    const row = rowOf(frame.image, y);
    for (let offset = start[y] * RGB; offset < end[y] * RGB; offset += 1) {
      row[offset] = tables[offset % RGB][row[offset]];
    }
  }
}

// Uint8ClampedArray rounds and clamps on assignment, so the table holds the whole transfer curve.
function gainTable(gain: number): Uint8ClampedArray {
  return Uint8ClampedArray.from({ length: 256 }, (_, value) =>
    Math.round(value * gain),
  );
}
