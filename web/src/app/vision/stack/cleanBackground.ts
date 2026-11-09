/**
 * The median of `values[0, count)` over the samples whose `hidden` flag is 0, rounded like selectMedian; `fallback` when every
 * sample is hidden. Writes the visible samples into `scratch` (at least `count` bytes), so `values` stays as it was.
 */
export function cleanMedian(
  input: {
    readonly values: Uint8Array;
    readonly hidden: Uint8Array;
    readonly count: number;
    readonly fallback: number;
  },
  scratch: Uint8Array,
): number {
  const { values, hidden, count, fallback } = input;
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    if (hidden[index] !== 0) continue;
    scratch[visible] = values[index];
    visible += 1;
  }
  if (visible === 0) return fallback;
  const sorted = scratch.subarray(0, visible).sort();
  const lower = sorted[(visible - 1) >> 1];
  const upper = sorted[visible >> 1];
  return Math.round((lower + upper) / 2);
}
