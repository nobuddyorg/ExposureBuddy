/** A frame whose sharpness is below this share of the burst's median is taken to be blurred; from synthetic bursts, not yet real ones. */
export const BLURRED_SHARPNESS_RATIO = 0.7;

/**
 * The frames in `sharpnessByFrame` (burst index → sharpness) blurred well past the rest of the burst, never `reference`.
 * Only frames below the lower median qualify, so at least half the frames stay: two of two, two of three.
 */
export function blurredFrames(
  sharpnessByFrame: ReadonlyMap<number, number>,
  reference: number,
): number[] {
  const sorted = [...sharpnessByFrame.values()].sort((a, b) => a - b);
  const lowerMedian = sorted[Math.floor((sorted.length - 1) / 2)];
  const threshold = BLURRED_SHARPNESS_RATIO * lowerMedian;
  return [...sharpnessByFrame]
    .filter(([index, value]) => index !== reference && value < threshold)
    .map(([index]) => index);
}
