import { indices } from '../indices';
import type { GrayImage, RgbaImage } from '../types';

const HALF = 128;
/** The colour grid the hole is filled on has about this many cells along its long edge. */
const GRID_CELLS = 160;

interface Grid {
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  /** RGB per cell, valid only where `known` is 1. */
  readonly colors: Float32Array;
  readonly known: Uint8Array;
}

/** The average colour of the pixels outside the hole, per cell of a coarse grid; cells that saw none stay unknown. */
function sampleGrid(image: RgbaImage, hole: GrayImage): Grid {
  const cell = Math.max(
    1,
    Math.ceil(Math.max(image.width, image.height) / GRID_CELLS),
  );
  const columns = Math.ceil(image.width / cell);
  const rows = Math.ceil(image.height / cell);
  const sums = new Float64Array(columns * rows * 3);
  const counts = new Uint32Array(columns * rows);
  for (const y of indices(image.height)) {
    for (const x of indices(image.width)) {
      const pixel = y * image.width + x;
      if (hole.data[pixel] >= HALF) continue;
      const target = Math.floor(y / cell) * columns + Math.floor(x / cell);
      counts[target] += 1;
      for (const channel of [0, 1, 2])
        sums[target * 3 + channel] += image.data[pixel * 4 + channel];
    }
  }
  const colors = new Float32Array(columns * rows * 3);
  const known = new Uint8Array(columns * rows);
  for (const target of indices(columns * rows)) {
    if (counts[target] === 0) continue;
    known[target] = 1;
    for (const channel of [0, 1, 2])
      colors[target * 3 + channel] =
        sums[target * 3 + channel] / counts[target];
  }
  return { cell, columns, rows, colors, known };
}

/** The summed colour of the known cells in the 3 × 3 block around `target` (itself included), and how many there are. */
function knownNeighbourhood(
  grid: Grid,
  target: number,
): { sum: Float32Array; count: number } {
  const column = target % grid.columns;
  const row = Math.floor(target / grid.columns);
  const sum = new Float32Array(3);
  let count = 0;
  for (
    let r = Math.max(0, row - 1);
    r <= Math.min(grid.rows - 1, row + 1);
    r += 1
  ) {
    for (
      let c = Math.max(0, column - 1);
      c <= Math.min(grid.columns - 1, column + 1);
      c += 1
    ) {
      const neighbour = r * grid.columns + c;
      if (grid.known[neighbour] === 0) continue;
      count += 1;
      for (const channel of [0, 1, 2])
        sum[channel] += grid.colors[neighbour * 3 + channel];
    }
  }
  return { sum, count };
}

/** Grows the known colours inwards one ring of cells at a time until every cell has one. */
function fillUnknown(grid: Grid): void {
  let remaining = grid.known.reduce(
    (count, known) => count + (known === 0 ? 1 : 0),
    0,
  );
  while (remaining > 0) {
    const ring: { target: number; mean: Float32Array }[] = [];
    for (const target of indices(grid.columns * grid.rows)) {
      if (grid.known[target] === 1) continue;
      const { sum, count } = knownNeighbourhood(grid, target);
      if (count > 0) ring.push({ target, mean: sum.map((v) => v / count) });
    }
    for (const { target, mean } of ring) {
      grid.colors.set(mean, target * 3);
      grid.known[target] = 1;
    }
    remaining -= ring.length;
  }
}

/** Rounds of smoothing over the filled cells: enough for a fill to settle across a hole that spans most of the grid. */
const RELAX_ROUNDS = 120;

function relaxOnce(grid: Grid, filled: readonly number[]): void {
  // Every cell is known by now, so each block holds at least the cell itself.
  const settled = filled.map((target) => {
    const { sum, count } = knownNeighbourhood(grid, target);
    return sum.map((v) => v / count);
  });
  filled.forEach((target, index) =>
    grid.colors.set(settled[index], target * 3),
  );
}

/** Lets every filled cell settle to the mean of its neighbours, known cells fixed: the ring fill alone leaves diamond steps. */
function relax(grid: Grid, filled: readonly number[]): void {
  indices(RELAX_ROUNDS).forEach(() => relaxOnce(grid, filled));
}

/** The grid colour at pixel (x, y), interpolated between the four nearest cell centres. */
function colorAt(grid: Grid, x: number, y: number, channel: number): number {
  const gx = Math.max(0, (x + 0.5) / grid.cell - 0.5);
  const gy = Math.max(0, (y + 0.5) / grid.cell - 0.5);
  // Past the last cell centre both neighbours are that cell, so the fraction does not matter.
  const x0 = Math.min(grid.columns - 1, Math.floor(gx));
  const y0 = Math.min(grid.rows - 1, Math.floor(gy));
  const x1 = Math.min(grid.columns - 1, x0 + 1);
  const y1 = Math.min(grid.rows - 1, y0 + 1);
  const fx = gx - Math.floor(gx);
  const fy = gy - Math.floor(gy);
  const at = (column: number, row: number) =>
    grid.colors[(row * grid.columns + column) * 3 + channel];
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** `image` with the hole (mask ≥ 128) replaced by the colours around it, spread inwards; with nothing around it, a copy. */
export function fillHole(image: RgbaImage, hole: GrayImage): RgbaImage {
  const data = Uint8ClampedArray.from(image.data);
  const grid = sampleGrid(image, hole);
  if (grid.known.every((known) => known === 0)) return { ...image, data };
  const unknown = indices(grid.columns * grid.rows).filter(
    (target) => grid.known[target] === 0,
  );
  fillUnknown(grid);
  relax(grid, unknown);
  for (const y of indices(image.height)) {
    for (const x of indices(image.width)) {
      const pixel = y * image.width + x;
      if (hole.data[pixel] < HALF) continue;
      for (const channel of [0, 1, 2])
        data[pixel * 4 + channel] = colorAt(grid, x, y, channel);
    }
  }
  return { width: image.width, height: image.height, data };
}
