import type { GrayImage, RgbaImage, Size } from '../types';

type PixelBuffer = Uint8Array | Uint8ClampedArray;

interface PixelSource {
  readonly width: number;
  readonly height: number;
  readonly data: PixelBuffer;
}

/** Returns the largest size with `size`'s aspect whose long edge is at most `maxLongEdge`; never upscales, so `scale` ≤ 1. */
export function fitWithin(
  size: Size,
  maxLongEdge: number,
): Size & { scale: number } {
  const longEdge = Math.max(size.width, size.height);
  const scale = Math.min(1, maxLongEdge / longEdge);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    scale,
  };
}

/** Returns `image` resampled to `target`: area-averaged when no edge grows (an exact copy at equal size), bilinear otherwise. */
export function resizeRgba(image: RgbaImage, target: Size): RgbaImage {
  const data = new Uint8ClampedArray(target.width * target.height * 4);
  resample(image, 4, target, data);
  return { width: target.width, height: target.height, data };
}

/** Returns `image` resampled to `target`: area-averaged when no edge grows (an exact copy at equal size), bilinear otherwise. */
export function resizeGray(image: GrayImage, target: Size): GrayImage {
  const data = new Uint8Array(target.width * target.height);
  resample(image, 1, target, data);
  return { width: target.width, height: target.height, data };
}

function resample(
  source: PixelSource,
  channels: number,
  target: Size,
  output: PixelBuffer,
): void {
  const shrinks =
    target.width <= source.width && target.height <= source.height;
  if (source.width === target.width && source.height === target.height) {
    output.set(source.data);
  } else if (shrinks) {
    areaAverage(source, channels, target, output);
  } else {
    bilinear(source, channels, target, output);
  }
}

interface SourceSpan {
  readonly firstSource: number;
  readonly weights: readonly number[];
}

// Target sample `t` covers source [t·S, (t+1)·S) in units of 1/T source samples; each weight is one source sample's overlap, an integer.
function sourceSpans(sourceLength: number, targetLength: number): SourceSpan[] {
  return Array.from({ length: targetLength }, (_, target) => {
    const spanStart = target * sourceLength;
    const spanEnd = spanStart + sourceLength;
    const firstSource = Math.floor(spanStart / targetLength);
    const weights: number[] = [];
    for (
      let source = firstSource;
      source * targetLength < spanEnd;
      source += 1
    ) {
      weights.push(
        Math.min(spanEnd, (source + 1) * targetLength) -
          Math.max(spanStart, source * targetLength),
      );
    }
    return { firstSource, weights };
  });
}

function areaAverage(
  source: PixelSource,
  channels: number,
  target: Size,
  output: PixelBuffer,
): void {
  const { width, data } = source;
  const columns = sourceSpans(width, target.width);
  const rows = sourceSpans(source.height, target.height);
  // Integer weights sum to the source area per target sample, so one division normalises and the result is exactly rounded.
  const area = width * source.height;
  const rowSums = new Float64Array(target.width * channels);
  let outputOffset = 0;
  for (const row of rows) {
    rowSums.fill(0);
    let sourceRowOffset = row.firstSource * width;
    for (const rowWeight of row.weights) {
      let targetOffset = 0;
      for (const column of columns) {
        let inputOffset = (sourceRowOffset + column.firstSource) * channels;
        for (const columnWeight of column.weights) {
          const weight = rowWeight * columnWeight;
          for (let channel = 0; channel < channels; channel += 1) {
            rowSums[targetOffset + channel] +=
              weight * data[inputOffset + channel];
          }
          inputOffset += channels;
        }
        targetOffset += channels;
      }
      sourceRowOffset += width;
    }
    for (const sum of rowSums) {
      output[outputOffset] = Math.round(sum / area);
      outputOffset += 1;
    }
  }
}

interface AxisSample {
  readonly near: number;
  readonly far: number;
  readonly fraction: number;
}

// Centre-aligned: target `t` reads source (t+0.5)·scale−0.5, which stays below `sourceLength`, so only the low edge is clamped.
function axisSamples(sourceLength: number, targetLength: number): AxisSample[] {
  const scale = sourceLength / targetLength;
  return Array.from({ length: targetLength }, (_, target) => {
    const coordinate = Math.max(0, (target + 0.5) * scale - 0.5);
    const near = Math.floor(coordinate);
    return {
      near,
      far: Math.min(near + 1, sourceLength - 1),
      fraction: coordinate - near,
    };
  });
}

function bilinear(
  source: PixelSource,
  channels: number,
  target: Size,
  output: PixelBuffer,
): void {
  const { width, data } = source;
  const columns = axisSamples(width, target.width);
  const rows = axisSamples(source.height, target.height);
  let outputOffset = 0;
  for (const row of rows) {
    const nearRow = row.near * width;
    const farRow = row.far * width;
    for (const column of columns) {
      const topLeft = (nearRow + column.near) * channels;
      const topRight = (nearRow + column.far) * channels;
      const bottomLeft = (farRow + column.near) * channels;
      const bottomRight = (farRow + column.far) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        const top =
          data[topLeft + channel] +
          column.fraction *
            (data[topRight + channel] - data[topLeft + channel]);
        const bottom =
          data[bottomLeft + channel] +
          column.fraction *
            (data[bottomRight + channel] - data[bottomLeft + channel]);
        output[outputOffset] = Math.round(top + row.fraction * (bottom - top));
        outputOffset += 1;
      }
    }
  }
}
