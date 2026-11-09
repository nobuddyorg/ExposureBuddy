import { indices } from '../../indices';
import type { Point } from '../../types';
import type { XFeatMaps } from './net';

const CELL = 8;
const CELL_PIXELS = CELL * CELL;
const CHANNELS = 64;
const NMS_RADIUS = 2;
/** The probability a pixel must have of being a keypoint to be considered. */
export const DETECTION_THRESHOLD = 0.05;

/** What a detection yields: positions in the image, strongest first, with the 64 L2-normalised descriptor values of each in `descriptors`. */
export interface XFeatKeypoints {
  readonly points: readonly Point[];
  readonly scores: readonly number[];
  readonly descriptors: Float32Array;
}

/** Softmax over the 65 logits of each cell, the "none" channel dropped, laid out as a full-resolution probability map. */
export function keypointProbabilities(maps: XFeatMaps): Float32Array {
  const { width, height, keypointLogits } = maps;
  const plane = width * height;
  const full = new Float32Array(plane * CELL_PIXELS);
  const exponentials = new Float64Array(CELL_PIXELS + 1);
  for (const y of indices(height)) {
    for (const x of indices(width)) {
      const cell = y * width + x;
      let largest = -Infinity;
      for (const channel of indices(CELL_PIXELS + 1))
        largest = Math.max(largest, keypointLogits[channel * plane + cell]);
      let sum = 0;
      for (const channel of indices(CELL_PIXELS + 1)) {
        exponentials[channel] = Math.exp(
          keypointLogits[channel * plane + cell] - largest,
        );
        sum += exponentials[channel];
      }
      for (const channel of indices(CELL_PIXELS)) {
        const row = y * CELL + Math.floor(channel / CELL);
        const column = x * CELL + (channel % CELL);
        full[row * width * CELL + column] = exponentials[channel] / sum;
      }
    }
  }
  return full;
}

/** The pixels that are the largest in their 5 × 5 neighbourhood (ties count) and above the threshold, in row-major order. */
export function localMaxima(
  map: Float32Array,
  size: { readonly width: number; readonly height: number },
  threshold = DETECTION_THRESHOLD,
): Point[] {
  const points: Point[] = [];
  for (const y of indices(size.height)) {
    for (const x of indices(size.width)) {
      const value = map[y * size.width + x];
      if (value <= threshold) continue;
      if (isLargestAround(map, size, x, y, value)) points.push({ x, y });
    }
  }
  return points;
}

function isLargestAround(
  map: Float32Array,
  size: { readonly width: number; readonly height: number },
  x: number,
  y: number,
  value: number,
): boolean {
  for (let dy = -NMS_RADIUS; dy <= NMS_RADIUS; dy += 1) {
    const row = y + dy;
    if (row < 0 || row >= size.height) continue;
    for (let dx = -NMS_RADIUS; dx <= NMS_RADIUS; dx += 1) {
      const column = x + dx;
      if (column < 0 || column >= size.width) continue;
      if (map[row * size.width + column] > value) return false;
    }
  }
  return true;
}

/**
 * Bilinear sample of one plane of `channels` planes, at image position (`x`, `y`) of an image `imageSize` large, where the plane has an eighth
 * of its resolution: grid_sample with align_corners = false after the position is normalised by (size − 1); outside the plane counts as 0.
 */
function sampleBilinear(
  plane: {
    readonly data: Float32Array;
    readonly width: number;
    readonly height: number;
    readonly offset: number;
  },
  imageSize: { readonly width: number; readonly height: number },
  point: Point,
): number {
  const fx = (point.x / (imageSize.width - 1)) * plane.width - 0.5;
  const fy = (point.y / (imageSize.height - 1)) * plane.height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const wx = fx - x0;
  const wy = fy - y0;
  const at = (px: number, py: number) =>
    px < 0 || py < 0 || px >= plane.width || py >= plane.height
      ? 0
      : plane.data[plane.offset + py * plane.width + px];
  return (
    (1 - wy) * ((1 - wx) * at(x0, y0) + wx * at(x0 + 1, y0)) +
    wy * ((1 - wx) * at(x0, y0 + 1) + wx * at(x0 + 1, y0 + 1))
  );
}

/** The 64 values of each cell scaled to length 1, in place on a copy. */
function normalisedCells(maps: XFeatMaps): Float32Array {
  const plane = maps.width * maps.height;
  const result = Float32Array.from(maps.features);
  for (const cell of indices(plane)) {
    let squares = 0;
    for (const channel of indices(CHANNELS))
      squares += result[channel * plane + cell] ** 2;
    const length = Math.max(Math.sqrt(squares), 1e-12);
    for (const channel of indices(CHANNELS))
      result[channel * plane + cell] /= length;
  }
  return result;
}

/**
 * XFeat's keypoints of an image whose network output is `maps` (`imageSize` is the size the network saw): up to `topK`, the most reliable
 * first, with their descriptors; reliability is the keypoint probability times the cell's heatmap value.
 */
export function extractKeypoints(
  maps: XFeatMaps,
  imageSize: { readonly width: number; readonly height: number },
  topK: number,
  threshold = DETECTION_THRESHOLD,
): XFeatKeypoints {
  const probabilities = keypointProbabilities(maps);
  const candidates = localMaxima(probabilities, imageSize, threshold);
  const heat = {
    data: maps.heatmap,
    width: maps.width,
    height: maps.height,
    offset: 0,
  };
  const scored = candidates
    .map((point, index) => ({
      point,
      index,
      score:
        probabilities[point.y * imageSize.width + point.x] *
        sampleBilinear(heat, imageSize, point),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, topK);
  const cells = normalisedCells(maps);
  const plane = maps.width * maps.height;
  const descriptors = new Float32Array(scored.length * CHANNELS);
  scored.forEach((candidate, row) => {
    let squares = 0;
    for (const channel of indices(CHANNELS)) {
      const value = sampleBilinear(
        {
          data: cells,
          width: maps.width,
          height: maps.height,
          offset: channel * plane,
        },
        imageSize,
        candidate.point,
      );
      descriptors[row * CHANNELS + channel] = value;
      squares += value * value;
    }
    const length = Math.max(Math.sqrt(squares), 1e-12);
    for (const channel of indices(CHANNELS))
      descriptors[row * CHANNELS + channel] /= length;
  });
  return {
    points: scored.map((candidate) => candidate.point),
    scores: scored.map((candidate) => candidate.score),
    descriptors,
  };
}

/** The pairs (index in `a`, index in `b`) whose descriptors are each other's most similar by cosine, and at least `minimum` similar. */
export function mutualMatches(
  a: Float32Array,
  b: Float32Array,
  minimum = 0.82,
): readonly (readonly [number, number])[] {
  const countA = a.length / CHANNELS;
  const countB = b.length / CHANNELS;
  const similarity = (i: number, j: number) => {
    let sum = 0;
    for (const channel of indices(CHANNELS))
      sum += a[i * CHANNELS + channel] * b[j * CHANNELS + channel];
    return sum;
  };
  const bestInB = Array.from({ length: countA }, (_, i) =>
    bestIndex(countB, (j) => similarity(i, j)),
  );
  const bestInA = Array.from({ length: countB }, (_, j) =>
    bestIndex(countA, (i) => similarity(i, j)),
  );
  return indices(countA)
    .filter(
      (i) => bestInA[bestInB[i]] === i && similarity(i, bestInB[i]) > minimum,
    )
    .map((i) => [i, bestInB[i]] as const);
}

function bestIndex(count: number, value: (index: number) => number): number {
  let best = 0;
  let bestValue = -Infinity;
  for (const index of indices(count)) {
    const current = value(index);
    if (current > bestValue) {
      bestValue = current;
      best = index;
    }
  }
  return best;
}
