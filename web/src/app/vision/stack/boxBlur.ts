import type { Size } from '../types';
import { indices } from '../indices';

const DEFAULT_PASSES = 3;

/**
 * Box-blurs the single-channel `layer` (row-major `size`) in place, `passes` times, with a (2·radius + 1)² edge-clamped window;
 * radius 0 or no passes leaves it as it is. Extra memory is one row plus radius + 2 rows, never a second layer.
 */
export function boxBlurInPlace(
  layer: Float32Array,
  size: Size,
  radius: number,
  passes = DEFAULT_PASSES,
): void {
  const line = new Float32Array(size.width);
  const saved = new Float32Array(savedRows(radius, size.height) * size.width);
  const columnSums = new Float64Array(size.width);
  for (let pass = 0; pass < passes; pass += 1) {
    for (const y of indices(size.height)) {
      const row = layer.subarray(y * size.width, (y + 1) * size.width);
      line.set(row);
      blurLine(line, row, radius);
    }
    blurColumns(layer, { size, radius, saved, columnSums });
  }
}

/** Rows the vertical pass keeps before overwriting them: a row leaves the window radius + 1 rows after its own, and no image has more rows than its height. */
export function savedRows(radius: number, height: number): number {
  return Math.min(radius + 2, height);
}

// Window mean along one line; the clamped edge windows are handled before and after an unclamped interior loop.
function blurLine(
  input: Float32Array,
  output: Float32Array,
  radius: number,
): void {
  const last = input.length - 1;
  const windowScale = 1 / (2 * radius + 1);
  let sum = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    sum += input[clampIndex(offset, last)];
  }
  output[0] = sum * windowScale;
  const interiorStart = Math.min(radius + 1, input.length);
  const interiorEnd = Math.max(interiorStart, input.length - radius);
  for (let position = 1; position < interiorStart; position += 1) {
    sum += input[clampIndex(position + radius, last)] - input[0];
    output[position] = sum * windowScale;
  }
  for (let position = interiorStart; position < interiorEnd; position += 1) {
    sum += input[position + radius] - input[position - radius - 1];
    output[position] = sum * windowScale;
  }
  for (let position = interiorEnd; position <= last; position += 1) {
    sum += input[last] - input[clampIndex(position - radius - 1, last)];
    output[position] = sum * windowScale;
  }
}

interface ColumnPass {
  readonly size: Size;
  readonly radius: number;
  /** A ring of the original rows still to leave the window: row k sits in slot k mod (saved rows). */
  readonly saved: Float32Array;
  readonly columnSums: Float64Array;
}

// Vertical window mean, swept row by row with one running sum per column; a row is saved before it is overwritten, as it leaves the window later.
function blurColumns(layer: Float32Array, pass: ColumnPass): void {
  const { size, radius, saved, columnSums } = pass;
  const { width } = size;
  const last = size.height - 1;
  const slots = saved.length / width;
  const windowScale = 1 / (2 * radius + 1);
  const original = (y: number) => {
    const slot = (y % slots) * width;
    return saved.subarray(slot, slot + width);
  };
  columnSums.fill(0);
  for (let offset = -radius; offset <= radius; offset += 1) {
    const rowStart = clampIndex(offset, last) * width;
    columnSums.forEach((sum, x) => {
      columnSums[x] = sum + layer[rowStart + x];
    });
  }
  for (const y of indices(size.height)) {
    const rowStart = y * width;
    original(y).set(layer.subarray(rowStart, rowStart + width));
    // Rows below y are untouched yet; rows above it were overwritten, so the leaving one comes from the ring.
    const entering = clampIndex(y + radius, last) * width;
    const leaving = original(clampIndex(y - radius - 1, last));
    for (let x = 0; x < width; x += 1) {
      // Row 0 is the initial window itself; every later row slides it by one.
      if (y > 0) columnSums[x] += layer[entering + x] - leaving[x];
      layer[rowStart + x] = columnSums[x] * windowScale;
    }
  }
}

function clampIndex(index: number, last: number): number {
  return Math.min(Math.max(index, 0), last);
}
