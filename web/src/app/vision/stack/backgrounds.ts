const OPAQUE = 255;
const MAD_TO_SIGMA = 1.4826;
const CLIP_SIGMAS = 3;
const MIN_CLIP_LEVELS = 8;
const MODE_WINDOW_LEVELS = 32;

/** Order of the estimates `robustBackgrounds` writes: the modes after `median`. */
export const ROBUST_MODE_COUNT = 3;

/**
 * Sorts `values[0, count)` in place and writes into `estimates` the trimmed mean (middle half), the clipped mean
 * (samples within 3 MAD-sigmas of `median`, at least 8 levels) and the densest 32-level window's median; `scratch` holds `count` bytes.
 */
export function robustBackgrounds(
  input: {
    readonly values: Uint8Array;
    readonly count: number;
    readonly median: number;
  },
  scratch: Uint8Array,
  estimates: Uint8Array,
): void {
  const { values, count, median } = input;
  const sorted = values.subarray(0, count).sort();
  estimates[0] = trimmedMean(sorted);
  estimates[1] = clippedMean(sorted, median, scratch);
  estimates[2] = densestWindowMedian(sorted);
}

function trimmedMean(sorted: Uint8Array): number {
  const trim = sorted.length >> 2;
  return meanOf(sorted, trim, sorted.length - trim);
}

function clippedMean(
  sorted: Uint8Array,
  median: number,
  scratch: Uint8Array,
): number {
  const { length } = sorted;
  sorted.forEach((value, index) => {
    scratch[index] = Math.abs(value - median);
  });
  const deviations = scratch.subarray(0, length).sort();
  const mad = deviations[length >> 1];
  const limit = Math.max(MIN_CLIP_LEVELS, CLIP_SIGMAS * MAD_TO_SIGMA * mad);
  let sum = 0;
  let kept = 0;
  for (const value of sorted) {
    if (Math.abs(value - median) > limit) continue;
    sum += value;
    kept += 1;
  }
  return Math.round(sum / kept);
}

// Two-pointer sweep over the sorted values; a tie keeps the darker window.
function densestWindowMedian(sorted: Uint8Array): number {
  let bestStart = 0;
  let bestEnd = 0;
  let start = 0;
  for (let end = 0; end < sorted.length; end += 1) {
    while (sorted[end] - sorted[start] > MODE_WINDOW_LEVELS) start += 1;
    if (end - start > bestEnd - bestStart) {
      bestStart = start;
      bestEnd = end;
    }
  }
  return medianOf(sorted, bestStart, bestEnd + 1);
}

// Middle of sorted[from, to): a near outlier inside the window must not pull the answer.
function medianOf(sorted: Uint8Array, from: number, to: number): number {
  const lower = sorted[(from + to - 1) >> 1];
  const upper = sorted[(from + to) >> 1];
  return Math.round((lower + upper) / 2);
}

function meanOf(values: Uint8Array, from: number, to: number): number {
  let sum = 0;
  for (let index = from; index < to; index += 1) sum += values[index];
  return Math.min(OPAQUE, Math.round(sum / (to - from)));
}
