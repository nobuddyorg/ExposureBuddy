import type { GrayImage } from '../types';

/** Returns `image` box-blurred with a (2·radius + 1)² window, edges replicated; radius 0 returns a copy. */
export function boxBlurGray(image: GrayImage, radius: number): GrayImage {
  const { width, height, data } = image;
  if (radius <= 0) {
    return { width, height, data: new Uint8Array(data) };
  }
  const rowSums = new Uint32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    slidingWindowSum(data, rowSums, {
      start: y * width,
      step: 1,
      length: width,
      radius,
    });
  }
  const windowSums = new Uint32Array(width * height);
  for (let x = 0; x < width; x += 1) {
    slidingWindowSum(rowSums, windowSums, {
      start: x,
      step: width,
      length: height,
      radius,
    });
  }
  const windowArea = (2 * radius + 1) * (2 * radius + 1);
  const blurred = new Uint8Array(width * height);
  for (let index = 0; index < blurred.length; index += 1) {
    blurred[index] = Math.round(windowSums[index] / windowArea);
  }
  return { width, height, data: blurred };
}

interface Line {
  readonly start: number;
  readonly step: number;
  readonly length: number;
  readonly radius: number;
}

// Writes, for every position on the line, the sum of the 2·radius + 1 samples around it with indices clamped to the line.
function slidingWindowSum(
  input: ArrayLike<number>,
  output: Uint32Array,
  line: Line,
): void {
  const { start, step, length, radius } = line;
  const last = length - 1;
  let sum = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    sum += input[start + clampIndex(offset, last) * step];
  }
  output[start] = sum;
  for (let position = 1; position < length; position += 1) {
    const entering = clampIndex(position + radius, last);
    const leaving = clampIndex(position - radius - 1, last);
    sum += input[start + entering * step] - input[start + leaving * step];
    output[start + position * step] = sum;
  }
}

function clampIndex(index: number, last: number): number {
  return Math.min(Math.max(index, 0), last);
}
