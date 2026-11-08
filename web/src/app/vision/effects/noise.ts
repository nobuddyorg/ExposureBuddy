/** A pseudo-random value in [0, 1) for an integer lattice point; the same point and seed always give the same value. */
function lattice(column: number, row: number, seed: number): number {
  let hash =
    Math.imul(column, 374761393) ^
    Math.imul(row, 668265263) ^
    Math.imul(seed, 2147483647);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth noise in [0, 1]: lattice values blended with a smoothstep, so it has no creases. */
export function valueNoise(x: number, y: number, seed: number): number {
  const column = Math.floor(x);
  const row = Math.floor(y);
  const fx = smooth(x - column);
  const fy = smooth(y - row);
  const top =
    lattice(column, row, seed) * (1 - fx) + lattice(column + 1, row, seed) * fx;
  const bottom =
    lattice(column, row + 1, seed) * (1 - fx) +
    lattice(column + 1, row + 1, seed) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Three octaves of value noise, normalised to [0, 1]: big slow swirls with finer detail on them. */
export function fractalNoise(x: number, y: number, seed: number): number {
  return (
    (valueNoise(x, y, seed) * 4 +
      valueNoise(x * 2, y * 2, seed + 1) * 2 +
      valueNoise(x * 4, y * 4, seed + 2)) /
    7
  );
}
