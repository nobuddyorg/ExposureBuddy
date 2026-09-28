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
  const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
    scale,
  };
}

/** Returns `image` resampled to `target`: area-averaged when no edge grows, bilinear otherwise, a copy at equal size. */
export function resizeRgba(image: RgbaImage, target: Size): RgbaImage {
  const data = new Uint8ClampedArray(target.width * target.height * 4);
  resample(image, 4, target, data);
  return { width: target.width, height: target.height, data };
}

/** Returns `image` resampled to `target`: area-averaged when no edge grows, bilinear otherwise, a copy at equal size. */
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
  if (source.width === target.width && source.height === target.height) {
    output.set(source.data);
    return;
  }
  const shrinks =
    target.width <= source.width && target.height <= source.height;
  if (shrinks) {
    areaAverage(source, channels, target, output);
  } else {
    bilinear(source, channels, target, output);
  }
}

interface AxisShrink {
  readonly sourceLength: number;
  readonly targetLength: number;
  readonly lineCount: number;
  readonly sourceStep: number;
  readonly sourceLineStep: number;
  readonly targetStep: number;
  readonly targetLineStep: number;
  readonly channels: number;
}

function areaAverage(
  source: PixelSource,
  channels: number,
  target: Size,
  output: PixelBuffer,
): void {
  const { width, height } = source;
  const rowsShrunk = new Float32Array(target.width * height * channels);
  shrinkAxis(source.data, rowsShrunk, {
    sourceLength: width,
    targetLength: target.width,
    lineCount: height,
    sourceStep: channels,
    sourceLineStep: width * channels,
    targetStep: channels,
    targetLineStep: target.width * channels,
    channels,
  });
  const shrunk = new Float32Array(target.width * target.height * channels);
  shrinkAxis(rowsShrunk, shrunk, {
    sourceLength: height,
    targetLength: target.height,
    lineCount: target.width,
    sourceStep: target.width * channels,
    sourceLineStep: channels,
    targetStep: target.width * channels,
    targetLineStep: channels,
    channels,
  });
  for (let index = 0; index < shrunk.length; index += 1) {
    output[index] = Math.round(shrunk[index]);
  }
}

// Each target sample averages the source span [t·ratio, (t+1)·ratio) with fractional end weights; `output` must start zeroed.
function shrinkAxis(
  input: ArrayLike<number>,
  output: Float32Array,
  axis: AxisShrink,
): void {
  const ratio = axis.sourceLength / axis.targetLength;
  const normalisation = 1 / ratio;
  for (let line = 0; line < axis.lineCount; line += 1) {
    const sourceLineOffset = line * axis.sourceLineStep;
    const targetLineOffset = line * axis.targetLineStep;
    for (let target = 0; target < axis.targetLength; target += 1) {
      const spanStart = target * ratio;
      const spanEnd = Math.min(axis.sourceLength, (target + 1) * ratio);
      const outputOffset = targetLineOffset + target * axis.targetStep;
      const lastSource = Math.ceil(spanEnd);
      for (
        let source = Math.floor(spanStart);
        source < lastSource;
        source += 1
      ) {
        const overlap =
          Math.min(spanEnd, source + 1) - Math.max(spanStart, source);
        const weight = overlap * normalisation;
        const inputOffset = sourceLineOffset + source * axis.sourceStep;
        for (let channel = 0; channel < axis.channels; channel += 1) {
          output[outputOffset + channel] +=
            weight * input[inputOffset + channel];
        }
      }
    }
  }
}

function bilinear(
  source: PixelSource,
  channels: number,
  target: Size,
  output: PixelBuffer,
): void {
  const { width, height, data } = source;
  const scaleX = width / target.width;
  const scaleY = height / target.height;
  for (let targetY = 0; targetY < target.height; targetY += 1) {
    const sourceY = clampCoordinate((targetY + 0.5) * scaleY - 0.5, height);
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(y0 + 1, height - 1);
    const fractionY = sourceY - y0;
    for (let targetX = 0; targetX < target.width; targetX += 1) {
      const sourceX = clampCoordinate((targetX + 0.5) * scaleX - 0.5, width);
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(x0 + 1, width - 1);
      const fractionX = sourceX - x0;
      const topLeft = (y0 * width + x0) * channels;
      const topRight = (y0 * width + x1) * channels;
      const bottomLeft = (y1 * width + x0) * channels;
      const bottomRight = (y1 * width + x1) * channels;
      const outputOffset = (targetY * target.width + targetX) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        const top =
          data[topLeft + channel] +
          fractionX * (data[topRight + channel] - data[topLeft + channel]);
        const bottom =
          data[bottomLeft + channel] +
          fractionX *
            (data[bottomRight + channel] - data[bottomLeft + channel]);
        output[outputOffset + channel] = Math.round(
          top + fractionY * (bottom - top),
        );
      }
    }
  }
}

function clampCoordinate(coordinate: number, length: number): number {
  return Math.min(Math.max(coordinate, 0), length - 1);
}
