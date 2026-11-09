import { createBandedRgb, rowOf } from '../image/banded';
import type { SmearSum } from '../effects/smear';
import type { BandedRgb, Rect } from '../types';

const RGB = 3;

export interface TrailMeanInput {
  /** The scene without its movers, crop-sized. */
  readonly background: BandedRgb;
  /** The plain long exposure, crop-sized: the result at `amount` 0. */
  readonly mean: BandedRgb;
  /** The movers' smeared frames, at the working size. */
  readonly sum: SmearSum;
  /** How many frames were added to `sum`. */
  readonly frames: number;
  /** Where the crop lies in the working size. */
  readonly rect: Rect;
  /** 0 is the plain mean, 1 the full trails. */
  readonly amount: number;
}

/**
 * The long exposure with the movers drawn as trails: the background where no mover passed, the mover's colour where one did,
 * and `amount` of the way from the plain mean to that.
 */
export function trailMean(input: TrailMeanInput): BandedRgb {
  const { background, mean, sum, frames, rect, amount } = input;
  const result = createBandedRgb(mean, mean.bandRows);
  for (let y = 0; y < mean.height; y += 1) {
    const out = rowOf(result, y);
    const plain = rowOf(mean, y);
    const behind = rowOf(background, y);
    const sumRow = (rect.y + y) * sum.width + rect.x;
    for (let x = 0; x < mean.width; x += 1) {
      const covered = Math.min(1, sum.coverage[sumRow + x] / frames);
      for (let channel = 0; channel < RGB; channel += 1) {
        const offset = x * RGB + channel;
        const trailed =
          behind[offset] * (1 - covered) +
          sum.colour[(sumRow + x) * RGB + channel] / frames;
        out[offset] = Math.round(
          plain[offset] + amount * (trailed - plain[offset]),
        );
      }
    }
  }
  return result;
}
