import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  extractKeypoints,
  keypointProbabilities,
  localMaxima,
  mutualMatches,
} from './keypoints';
import { parseXFeatWeights, runXFeat } from './net';
import reference from './xfeat.keypoints.json';

const bytes = readFileSync(
  new URL('../../../../../public/ml/xfeat-core.bin', import.meta.url),
);
const weights = parseXFeatWeights(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
);
const image = {
  width: reference.width,
  height: reference.height,
  data: Uint8Array.from(reference.input),
};
const maps = runXFeat(weights, image);

describe('extractKeypoints', () => {
  const found = extractKeypoints(maps, image, reference.topK);

  it('finds the keypoints of the reference implementation, in the same order', () => {
    expect(found.points.map((point) => [point.x, point.y]).flat()).toEqual(
      reference.positions,
    );
  });

  it('gives their reliability scores', () => {
    found.scores.forEach((score, index) =>
      expect(score).toBeCloseTo(reference.scores[index], 3),
    );
  });

  it('gives their descriptors, 64 values each, of length 1', () => {
    expect(found.descriptors).toHaveLength(reference.topK * 64);
    expect(
      Math.max(
        ...found.descriptors.map((value, index) =>
          Math.abs(value - reference.descriptors[index]),
        ),
      ),
    ).toBeLessThan(5e-3);
    for (let row = 0; row < found.points.length; row += 1) {
      const squares = found.descriptors
        .subarray(row * 64, row * 64 + 64)
        .reduce((sum, v) => sum + v * v, 0);
      expect(squares).toBeCloseTo(1, 4);
    }
  });

  it('keeps no more than asked for, the most reliable first', () => {
    const few = extractKeypoints(maps, image, 5);
    expect(few.points).toHaveLength(5);
    expect(few.scores).toEqual([...found.scores].slice(0, 5));
    expect(
      found.scores.every((score, i) => i === 0 || score <= found.scores[i - 1]),
    ).toBe(true);
  });

  it('finds fewer with a higher threshold', () => {
    expect(extractKeypoints(maps, image, 1000, 0.3).points.length).toBeLessThan(
      extractKeypoints(maps, image, 1000).points.length,
    );
  });
});

describe('keypointProbabilities', () => {
  it('is a probability per pixel: between 0 and 1, and below 1 in sum over a cell', () => {
    const map = keypointProbabilities(maps);
    expect(map).toHaveLength(image.width * image.height);
    expect(map.every((value) => value >= 0 && value <= 1)).toBe(true);
    let cell = 0;
    for (let dy = 0; dy < 8; dy += 1)
      for (let dx = 0; dx < 8; dx += 1) cell += map[dy * image.width + dx];
    expect(cell).toBeLessThan(1);
  });
});

describe('localMaxima', () => {
  const size = { width: 12, height: 12 };

  it('keeps a peak above the threshold and drops what is not the largest within two pixels', () => {
    const map = new Float32Array(144);
    map[5 * 12 + 5] = 0.9;
    map[5 * 12 + 6] = 0.5;
    map[9 * 12 + 9] = 0.2;
    map[1 * 12 + 1] = 0.04;
    expect(localMaxima(map, size).map((p) => [p.x, p.y])).toEqual([
      [5, 5],
      [9, 9],
    ]);
  });

  it('counts equal neighbours as maxima, like the reference', () => {
    const map = new Float32Array(144);
    map[5 * 12 + 5] = 0.5;
    map[5 * 12 + 6] = 0.5;
    expect(localMaxima(map, size)).toHaveLength(2);
  });

  it('looks three pixels away no more', () => {
    const map = new Float32Array(144);
    map[2 * 12 + 2] = 0.3;
    map[2 * 12 + 5] = 0.9;
    expect(localMaxima(map, size)).toHaveLength(2);
  });
});

describe('mutualMatches', () => {
  const unit = (values: number[]) => {
    const full = new Float32Array(64);
    values.forEach((value, index) => (full[index] = value));
    return full;
  };
  const concat = (...parts: Float32Array[]) =>
    Float32Array.from(parts.flatMap((part) => [...part]));

  it('pairs descriptors that choose each other', () => {
    const a = concat(unit([1]), unit([0, 1]));
    const b = concat(unit([0, 1]), unit([1]));
    expect(mutualMatches(a, b)).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it('drops a pair that is not mutual: two in a claim the same one in b', () => {
    const a = concat(unit([1]), unit([0.99, 0.1]));
    const b = concat(unit([1]), unit([0, 0, 1]));
    expect(mutualMatches(a, b, -1)).toEqual([[0, 0]]);
  });

  it('drops a pair that is less similar than the minimum', () => {
    const a = concat(unit([1]));
    const b = concat(unit([0.5, 0.866]));
    expect(mutualMatches(a, b, 0.6)).toEqual([]);
    expect(mutualMatches(a, b, 0.4)).toEqual([[0, 0]]);
  });

  it('is empty for no descriptors', () => {
    expect(mutualMatches(new Float32Array(0), new Float32Array(64))).toEqual(
      [],
    );
  });
});
