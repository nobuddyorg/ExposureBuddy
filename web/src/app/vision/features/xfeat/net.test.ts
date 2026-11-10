import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseXFeatWeights, runXFeat } from './net';
import reference from './xfeat.reference.json';

const bytes = readFileSync(
  new URL('../../../../../public/ml/xfeat-core.bin', import.meta.url),
);
const weights = parseXFeatWeights(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
);

const input = {
  width: 64,
  height: 64,
  data: Uint8Array.from(reference.input),
};

function worstDifference(
  actual: Float32Array,
  expected: readonly number[],
): number {
  expect(actual).toHaveLength(expected.length);
  return actual.reduce(
    (worst, value, index) => Math.max(worst, Math.abs(value - expected[index])),
    0,
  );
}

describe('runXFeat', () => {
  const maps = runXFeat(weights, input);

  it('has the layers of the published network', () => {
    expect(weights.size).toBe(27);
    expect(weights.get('block5.3')).toMatchObject({
      cin: 128,
      cout: 64,
      kernel: 1,
    });
    expect(weights.get('keypoint_head.3')).toMatchObject({
      cin: 64,
      cout: 65,
      relu: false,
    });
    expect(weights.get('heatmap_head.2')).toMatchObject({
      cout: 1,
      sigmoid: true,
    });
  });

  it('gives maps at an eighth of the image size', () => {
    expect([maps.width, maps.height]).toEqual([8, 8]);
    expect(maps.features).toHaveLength(64 * 64);
    expect(maps.keypointLogits).toHaveLength(65 * 64);
    expect(maps.heatmap).toHaveLength(64);
  });

  it('matches the reference implementation on the descriptors, the keypoint logits and the heatmap', () => {
    expect(worstDifference(maps.features, reference.feats)).toBeLessThan(1e-3);
    expect(worstDifference(maps.keypointLogits, reference.kp)).toBeLessThan(
      2e-3,
    );
    expect(worstDifference(maps.heatmap, reference.hm)).toBeLessThan(1e-3);
  });

  it('skips weights that are zero, in every layer, without a different answer to the rest', () => {
    const silent = new Map(
      [...weights].map(([name, layer]) => [
        name,
        { ...layer, weights: new Float32Array(layer.weights.length) },
      ]),
    );
    const result = runXFeat(silent, input);
    // With every weight zero only the folded biases are left, the same everywhere: the maps are flat per channel.
    expect(result.features.every((value) => Number.isFinite(value))).toBe(true);
    expect(new Set(result.heatmap).size).toBe(1);
  });

  it('names a layer the weights lack', () => {
    expect(() => runXFeat(new Map(), input)).toThrow(
      'The XFeat weights have no layer',
    );
  });

  it('refuses an image whose sides are not multiples of 32', () => {
    expect(() =>
      runXFeat(weights, { width: 40, height: 32, data: new Uint8Array(1280) }),
    ).toThrow(RangeError);
  });
});

describe('parseXFeatWeights', () => {
  it('refuses a file that is not the size its header says', () => {
    expect(() =>
      parseXFeatWeights(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength - 4,
        ),
      ),
    ).toThrow('not the size it says');
  });
});
