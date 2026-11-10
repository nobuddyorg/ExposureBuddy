import { indices } from '../../indices';
import type { GrayImage } from '../../types';

/** One convolution of the network with its batch norm folded in: `weights` is cout × cin × k × k, `bias` has cout entries. */
interface ConvLayer {
  readonly cin: number;
  readonly cout: number;
  readonly kernel: number;
  readonly stride: number;
  readonly padding: number;
  readonly relu: boolean;
  readonly sigmoid: boolean;
  readonly weights: Float32Array;
  readonly bias: Float32Array;
}

/** The layers of XFeat's backbone and heads, by name ("block1.0", "heatmap_head.2" …). */
export type XFeatWeights = ReadonlyMap<string, ConvLayer>;

interface Header {
  readonly layers: readonly {
    readonly name: string;
    readonly cin: number;
    readonly cout: number;
    readonly k: number;
    readonly stride: number;
    readonly pad: number;
    readonly relu: boolean;
    readonly sigmoid: boolean;
    readonly weights: number;
    readonly bias: number;
  }[];
  readonly floats: number;
}

const HEADER_LENGTH_BYTES = 4;
const FLOAT_BYTES = 4;

/** Reads the weights file: a little-endian u32 length, that many bytes of JSON describing the layers, then the float32 blob. */
export function parseXFeatWeights(buffer: ArrayBuffer): XFeatWeights {
  const length = new DataView(buffer).getUint32(0, true);
  const header = JSON.parse(
    new TextDecoder().decode(
      new Uint8Array(buffer, HEADER_LENGTH_BYTES, length),
    ),
  ) as Header;
  const start = HEADER_LENGTH_BYTES + length;
  if ((buffer.byteLength - start) / FLOAT_BYTES !== header.floats)
    throw new RangeError('The XFeat weights file is not the size it says.');
  const floats = new Float32Array(buffer.slice(start));
  return new Map(
    header.layers.map((layer) => [
      layer.name,
      {
        cin: layer.cin,
        cout: layer.cout,
        kernel: layer.k,
        stride: layer.stride,
        padding: layer.pad,
        relu: layer.relu,
        sigmoid: layer.sigmoid,
        weights: floats.subarray(
          layer.weights,
          layer.weights + layer.cout * layer.cin * layer.k * layer.k,
        ),
        bias: floats.subarray(layer.bias, layer.bias + layer.cout),
      },
    ]),
  );
}

/** A stack of `channels` planes of `width × height`, plane after plane. */
interface Planes {
  readonly channels: number;
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;
}

/** Adds one input channel's contribution to one output plane: `weightBase` is where that channel's k × k weights start. */
function accumulate(
  target: Float32Array,
  input: Planes,
  channel: number,
  conv: {
    readonly layer: ConvLayer;
    readonly weightBase: number;
    readonly width: number;
    readonly height: number;
  },
): void {
  const { layer, weightBase, width, height } = conv;
  const { kernel, stride, padding } = layer;
  const source = channel * input.width * input.height;
  for (let ky = 0; ky < kernel; ky += 1) {
    for (let kx = 0; kx < kernel; kx += 1) {
      const weight = layer.weights[weightBase + ky * kernel + kx];
      if (weight === 0) continue;
      // The columns whose source column lies inside the image: x · stride + kx − padding in [0, width).
      const first = Math.max(0, Math.ceil((padding - kx) / stride));
      const last = Math.min(
        width - 1,
        Math.floor((input.width - 1 + padding - kx) / stride),
      );
      const shift = kx - padding;
      for (let y = 0; y < height; y += 1) {
        const sy = y * stride + ky - padding;
        if (sy < 0 || sy >= input.height) continue;
        const row = source + sy * input.width + shift;
        const out = y * width;
        const values = input.data;
        for (let x = first; x <= last; x += 1)
          target[out + x] += weight * values[row + x * stride];
      }
    }
  }
}

function activate(plane: Float32Array, layer: ConvLayer): void {
  for (const pixel of indices(plane.length)) {
    if (layer.relu && plane[pixel] < 0) plane[pixel] = 0;
    if (layer.sigmoid) plane[pixel] = 1 / (1 + Math.exp(-plane[pixel]));
  }
}

/** accumulator[i] += weight × values[source + i] for the first `length` entries: the inner loop of the convolution. */
function shiftedAdd(
  accumulator: Float32Array,
  values: Float32Array,
  shift: {
    readonly weight: number;
    readonly source: number;
    readonly length: number;
  },
): void {
  const { weight, source, length } = shift;
  for (let i = 0; i < length; i += 1)
    accumulator[i] += weight * values[source + i];
}

/** Copies the first `width` columns of each row of `accumulator` (rows `wide` long) into plane `out` of `data`. */
function copyRows(
  accumulator: Float32Array,
  data: Float32Array,
  layout: {
    readonly wide: number;
    readonly width: number;
    readonly height: number;
    readonly out: number;
  },
): void {
  const { wide, width, height, out } = layout;
  for (const y of indices(height))
    data.set(
      accumulator.subarray(y * wide, y * wide + width),
      (out * height + y) * width,
    );
}

/** `input` with `padding` zeros around every plane. */
function padded(input: Planes, padding: number): Planes {
  const width = input.width + 2 * padding;
  const height = input.height + 2 * padding;
  const data = new Float32Array(input.channels * width * height);
  for (const channel of indices(input.channels))
    for (const y of indices(input.height))
      data.set(
        input.data.subarray(
          (channel * input.height + y) * input.width,
          (channel * input.height + y + 1) * input.width,
        ),
        (channel * height + y + padding) * width + padding,
      );
  return { channels: input.channels, width, height, data };
}

/**
 * A stride-1 convolution that keeps the size: every (kernel row, kernel column) is one shifted multiply-add over the whole padded plane in
 * one long loop, and the columns that wrapped around the padding are dropped afterwards.
 */
function convolveSame(input: Planes, layer: ConvLayer): Planes {
  const { kernel, padding } = layer;
  const { width, height } = input;
  const wide = padded(input, padding);
  const plane = wide.width * wide.height;
  const length = (height - 1) * wide.width + width;
  const data = new Float32Array(layer.cout * width * height);
  const accumulator = new Float32Array(height * wide.width);
  for (const out of indices(layer.cout)) {
    accumulator.fill(layer.bias[out]);
    for (let channel = 0; channel < layer.cin; channel += 1) {
      const weightBase = (out * layer.cin + channel) * kernel * kernel;
      for (let ky = 0; ky < kernel; ky += 1) {
        for (let kx = 0; kx < kernel; kx += 1) {
          const weight = layer.weights[weightBase + ky * kernel + kx];
          if (weight === 0) continue;
          shiftedAdd(accumulator, wide.data, {
            weight,
            source: channel * plane + ky * wide.width + kx,
            length,
          });
        }
      }
    }
    copyRows(accumulator, data, { wide: wide.width, width, height, out });
    activate(
      data.subarray(out * width * height, (out + 1) * width * height),
      layer,
    );
  }
  return { channels: layer.cout, width, height, data };
}

function convolve(input: Planes, layer: ConvLayer): Planes {
  if (layer.stride === 1 && 2 * layer.padding === layer.kernel - 1)
    return convolveSame(input, layer);
  const { kernel, stride, padding } = layer;
  const width = Math.floor((input.width + 2 * padding - kernel) / stride) + 1;
  const height = Math.floor((input.height + 2 * padding - kernel) / stride) + 1;
  const plane = width * height;
  const data = new Float32Array(layer.cout * plane);
  for (const out of indices(layer.cout)) {
    const target = data.subarray(out * plane, (out + 1) * plane);
    target.fill(layer.bias[out]);
    for (const channel of indices(layer.cin))
      accumulate(target, input, channel, {
        layer,
        weightBase: (out * layer.cin + channel) * kernel * kernel,
        width,
        height,
      });
    activate(target, layer);
  }
  return { channels: layer.cout, width, height, data };
}

function layerOf(weights: XFeatWeights, name: string): ConvLayer {
  const layer = weights.get(name);
  if (!layer) throw new RangeError(`The XFeat weights have no layer ${name}.`);
  return layer;
}

function run(
  weights: XFeatWeights,
  names: readonly string[],
  input: Planes,
): Planes {
  return names.reduce(
    (current, name) => convolve(current, layerOf(weights, name)),
    input,
  );
}

function add(a: Planes, b: Planes): Planes {
  return { ...a, data: a.data.map((value, index) => value + b.data[index]) };
}

/** F.interpolate(mode='bilinear', align_corners=False) of `input` to `width × height`. */
function resizeBilinear(input: Planes, width: number, height: number): Planes {
  const data = new Float32Array(input.channels * width * height);
  const scaleX = input.width / width;
  const scaleY = input.height / height;
  for (const channel of indices(input.channels)) {
    const source = channel * input.width * input.height;
    for (const y of indices(height)) {
      const fy = Math.max(0, (y + 0.5) * scaleY - 0.5);
      const y0 = Math.min(Math.floor(fy), input.height - 1);
      const y1 = Math.min(y0 + 1, input.height - 1);
      const wy = fy - y0;
      for (const x of indices(width)) {
        const fx = Math.max(0, (x + 0.5) * scaleX - 0.5);
        const x0 = Math.min(Math.floor(fx), input.width - 1);
        const x1 = Math.min(x0 + 1, input.width - 1);
        const wx = fx - x0;
        const at = (px: number, py: number) =>
          input.data[source + py * input.width + px];
        data[channel * width * height + y * width + x] =
          (1 - wy) * ((1 - wx) * at(x0, y0) + wx * at(x1, y0)) +
          wy * ((1 - wx) * at(x0, y1) + wx * at(x1, y1));
      }
    }
  }
  return { channels: input.channels, width, height, data };
}

/** Zero mean, unit variance over the whole image (InstanceNorm2d with eps 1e-5). */
function instanceNorm(image: GrayImage): Planes {
  const count = image.data.length;
  let sum = 0;
  for (const value of image.data) sum += value;
  const mean = sum / count;
  let squares = 0;
  for (const value of image.data) squares += (value - mean) ** 2;
  const scale = 1 / Math.sqrt(squares / count + 1e-5);
  return {
    channels: 1,
    width: image.width,
    height: image.height,
    data: Float32Array.from(image.data, (value) => (value - mean) * scale),
  };
}

function averagePool4(input: Planes): Planes {
  const width = Math.floor(input.width / 4);
  const height = Math.floor(input.height / 4);
  const data = new Float32Array(width * height);
  for (const y of indices(height)) {
    for (const x of indices(width)) {
      let sum = 0;
      for (const dy of indices(4))
        for (const dx of indices(4))
          sum += input.data[(y * 4 + dy) * input.width + x * 4 + dx];
      data[y * width + x] = sum / 16;
    }
  }
  return { channels: 1, width, height, data };
}

/** Cuts each 8 × 8 block of a single-channel image into 64 channels, one per position in the block (nn.Unfold with stride 8). */
function unfold8(input: Planes): Planes {
  const width = Math.floor(input.width / 8);
  const height = Math.floor(input.height / 8);
  const data = new Float32Array(64 * width * height);
  for (const dy of indices(8))
    for (const dx of indices(8))
      for (const y of indices(height))
        for (const x of indices(width))
          data[(dy * 8 + dx) * width * height + y * width + x] =
            input.data[(y * 8 + dy) * input.width + x * 8 + dx];
  return { channels: 64, width, height, data };
}

/** What the network gives for an image whose sides are multiples of 32: all at one eighth of the image's size. */
export interface XFeatMaps {
  readonly width: number;
  readonly height: number;
  /** 64 channels of descriptor, plane after plane. */
  readonly features: Float32Array;
  /** 65 channels of keypoint logits: 64 for the pixels of the 8 × 8 cell, one for "none". */
  readonly keypointLogits: Float32Array;
  /** Reliability of each cell, 0–1. */
  readonly heatmap: Float32Array;
}

const BLOCK = (name: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${name}.${index}`);

/** XFeat's network (CVPR 2024, Apache-2.0) over a grayscale image of 0–255 whose width and height are multiples of 32. */
export function runXFeat(weights: XFeatWeights, image: GrayImage): XFeatMaps {
  if (image.width % 32 !== 0 || image.height % 32 !== 0)
    throw new RangeError(
      'XFeat needs an image whose sides are multiples of 32.',
    );
  const normalised = instanceNorm(image);
  const skip = convolve(averagePool4(normalised), layerOf(weights, 'skip1'));
  const x1 = run(weights, BLOCK('block1', 4), normalised);
  const x2 = run(weights, BLOCK('block2', 2), add(x1, skip));
  const x3 = run(weights, BLOCK('block3', 3), x2);
  const x4 = run(weights, BLOCK('block4', 3), x3);
  const x5 = run(weights, BLOCK('block5', 4), x4);
  const fused = add(
    add(x3, resizeBilinear(x4, x3.width, x3.height)),
    resizeBilinear(x5, x3.width, x3.height),
  );
  const features = run(weights, BLOCK('block_fusion', 3), fused);
  const heatmap = run(weights, BLOCK('heatmap_head', 3), features);
  const logits = run(weights, BLOCK('keypoint_head', 4), unfold8(normalised));
  return {
    width: features.width,
    height: features.height,
    features: features.data,
    keypointLogits: logits.data,
    heatmap: heatmap.data,
  };
}
