import type { Size } from '../types';

const DEFAULT_PASSES = 3;

/** Returns a new Float32Array with `data` (interleaved `channels`, row-major `size`) box-blurred `passes` times with a (2·radius + 1)² edge-clamped window; radius 0 returns a copy. */
export function boxBlurFloat(
  data: Float32Array,
  size: Size,
  channels: number,
  radius: number,
  passes = DEFAULT_PASSES,
): Float32Array {
  if (radius <= 0 || passes <= 0) return new Float32Array(data);
  const rowLength = size.width * channels;
  let front = new Float32Array(data);
  let back = new Float32Array(data.length);
  const scratch = new Float32Array(data.length);
  const columnSums = new Float64Array(rowLength);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let y = 0; y < size.height; y += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        blurLine(front, scratch, {
          start: y * rowLength + channel,
          step: channels,
          length: size.width,
          radius,
        });
      }
    }
    blurColumns(scratch, back, columnSums, size.height, radius);
    [front, back] = [back, front];
  }
  return front;
}

interface Line {
  readonly start: number;
  readonly step: number;
  readonly length: number;
  readonly radius: number;
}

// Window mean along one line; the clamped edge windows are handled before and after an unclamped interior loop.
function blurLine(input: Float32Array, output: Float32Array, line: Line): void {
  const { start, step, length, radius } = line;
  const last = length - 1;
  const windowScale = 1 / (2 * radius + 1);
  let sum = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    sum += input[start + clampIndex(offset, last) * step];
  }
  output[start] = sum * windowScale;
  const interiorStart = Math.min(radius + 1, length);
  const interiorEnd = Math.max(interiorStart, length - radius);
  for (let position = 1; position < interiorStart; position += 1) {
    const entering = clampIndex(position + radius, last);
    sum += input[start + entering * step] - input[start];
    output[start + position * step] = sum * windowScale;
  }
  let enteringIndex = start + (interiorStart + radius) * step;
  let leavingIndex = start + (interiorStart - radius - 1) * step;
  let outputIndex = start + interiorStart * step;
  for (let position = interiorStart; position < interiorEnd; position += 1) {
    sum += input[enteringIndex] - input[leavingIndex];
    output[outputIndex] = sum * windowScale;
    enteringIndex += step;
    leavingIndex += step;
    outputIndex += step;
  }
  const lastIndex = start + last * step;
  for (let position = interiorEnd; position < length; position += 1) {
    const leaving = clampIndex(position - radius - 1, last);
    sum += input[lastIndex] - input[start + leaving * step];
    output[start + position * step] = sum * windowScale;
  }
}

// Vertical window mean, swept row by row with one running sum per column so memory access stays sequential.
function blurColumns(
  input: Float32Array,
  output: Float32Array,
  columnSums: Float64Array,
  height: number,
  radius: number,
): void {
  const rowLength = columnSums.length;
  const last = height - 1;
  const windowScale = 1 / (2 * radius + 1);
  columnSums.fill(0);
  for (let offset = -radius; offset <= radius; offset += 1) {
    const rowStart = clampIndex(offset, last) * rowLength;
    for (let index = 0; index < rowLength; index += 1) {
      columnSums[index] += input[rowStart + index];
    }
  }
  for (let index = 0; index < rowLength; index += 1) {
    output[index] = columnSums[index] * windowScale;
  }
  for (let y = 1; y < height; y += 1) {
    const enteringRow = clampIndex(y + radius, last) * rowLength;
    const leavingRow = clampIndex(y - radius - 1, last) * rowLength;
    const outputRow = y * rowLength;
    for (let index = 0; index < rowLength; index += 1) {
      columnSums[index] +=
        input[enteringRow + index] - input[leavingRow + index];
      output[outputRow + index] = columnSums[index] * windowScale;
    }
  }
}

function clampIndex(index: number, last: number): number {
  return Math.min(Math.max(index, 0), last);
}
