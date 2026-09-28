import type { Size } from '../types';

const DEFAULT_PASSES = 3;

interface Line {
  readonly start: number;
  readonly step: number;
  readonly length: number;
}

/** Returns a new Float32Array with `data` (interleaved `channels`, row-major `size`) box-blurred `passes` times with a (2·radius + 1)² edge-clamped window; radius 0 returns a copy. */
export function boxBlurFloat(
  data: Float32Array,
  size: Size,
  channels: number,
  radius: number,
  passes = DEFAULT_PASSES,
): Float32Array {
  if (radius <= 0 || passes <= 0) return new Float32Array(data);
  const { width, height } = size;
  const rowStride = width * channels;
  let front = new Float32Array(data);
  let back = new Float32Array(data.length);
  const scratch = new Float32Array(data.length);
  for (let pass = 0; pass < passes; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        blurLine(front, scratch, radius, {
          start: y * rowStride + channel,
          step: channels,
          length: width,
        });
      }
    }
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        blurLine(scratch, back, radius, {
          start: x * channels + channel,
          step: rowStride,
          length: height,
        });
      }
    }
    [front, back] = [back, front];
  }
  return front;
}

// Writes the mean of the 2·radius + 1 samples around every line position, indices clamped to the line.
function blurLine(
  input: Float32Array,
  output: Float32Array,
  radius: number,
  line: Line,
): void {
  const { start, step, length } = line;
  const last = length - 1;
  const windowScale = 1 / (2 * radius + 1);
  let sum = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    sum += input[start + clampIndex(offset, last) * step];
  }
  output[start] = sum * windowScale;
  for (let position = 1; position < length; position += 1) {
    const entering = clampIndex(position + radius, last);
    const leaving = clampIndex(position - radius - 1, last);
    sum += input[start + entering * step] - input[start + leaving * step];
    output[start + position * step] = sum * windowScale;
  }
}

function clampIndex(index: number, last: number): number {
  return Math.min(Math.max(index, 0), last);
}
