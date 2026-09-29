/** Returns a mulberry32 generator seeded with `seed`; each call yields a uniform float in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns one standard-normal sample (mean 0, σ 1) drawn from two `nextUniform` calls by Box–Muller. */
export function standardNormal(nextUniform: () => number): number {
  // 1 − u lies in (0, 1], so the logarithm never sees zero.
  const magnitude = Math.sqrt(-2 * Math.log(1 - nextUniform()));
  return magnitude * Math.cos(2 * Math.PI * nextUniform());
}
