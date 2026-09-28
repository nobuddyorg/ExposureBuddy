import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DESCRIPTOR_WORDS, type FeatureSet } from '../types';
import {
  DEFAULT_MATCH_OPTIONS,
  hammingDistance,
  matchDescriptors,
  popcount32,
} from './hamming';

function popcountByLoop(value: number): number {
  let count = 0;
  for (let bit = 0; bit < 32; bit += 1) {
    count += (value >>> bit) & 1;
  }
  return count;
}

// One descriptor per row; a word list shorter than 8 is padded with zeros.
function featureSet(descriptors: readonly (readonly number[])[]): FeatureSet {
  const words = new Uint32Array(descriptors.length * DESCRIPTOR_WORDS);
  descriptors.forEach((descriptor, index) => {
    words.set(descriptor, index * DESCRIPTOR_WORDS);
  });
  return {
    width: 64,
    height: 64,
    keypoints: descriptors.map((_, index) => ({
      x: index,
      y: index,
      score: 1,
      angle: 0,
    })),
    descriptors: words,
  };
}

// A word with exactly `bits` low bits set.
function lowBits(bits: number): number {
  return bits === 32 ? 0xffffffff : (1 << bits) - 1;
}

describe('popcount32', () => {
  it('counts no bits in 0, one in 1 and all 32 in 0xFFFFFFFF', () => {
    expect(popcount32(0)).toBe(0);
    expect(popcount32(1)).toBe(1);
    expect(popcount32(0xffffffff)).toBe(32);
  });

  it('counts alternating and byte patterns', () => {
    expect(popcount32(0xaaaaaaaa)).toBe(16);
    expect(popcount32(0x55555555)).toBe(16);
    expect(popcount32(0x80000000)).toBe(1);
    expect(popcount32(0x0f0f0f0f)).toBe(16);
    expect(popcount32(0x00ff00ff)).toBe(16);
  });

  it('agrees with a bit-by-bit loop for any 32-bit word, signed or unsigned', () => {
    fc.assert(
      fc.property(fc.integer({ min: -(2 ** 31), max: 2 ** 32 - 1 }), (word) => {
        expect(popcount32(word)).toBe(popcountByLoop(word));
      }),
    );
  });
});

describe('hammingDistance', () => {
  it('is 0 between identical descriptors and 256 between complementary ones', () => {
    const zeros = new Uint32Array(DESCRIPTOR_WORDS);
    const ones = new Uint32Array(DESCRIPTOR_WORDS).fill(0xffffffff);
    expect(hammingDistance(zeros, 0, zeros, 0)).toBe(0);
    expect(hammingDistance(zeros, 0, ones, 0)).toBe(256);
  });

  it('adds the differing bits over all eight words of the addressed keypoints', () => {
    const a = new Uint32Array(2 * DESCRIPTOR_WORDS);
    const b = new Uint32Array(3 * DESCRIPTOR_WORDS);
    // Keypoint 1 of a differs from keypoint 2 of b in 3 + 5 bits; the other keypoints are noise.
    a.fill(0xffffffff, 0, DESCRIPTOR_WORDS);
    a[DESCRIPTOR_WORDS] = lowBits(3);
    a[DESCRIPTOR_WORDS + 7] = lowBits(5);
    b.fill(0xf0f0f0f0, 0, 2 * DESCRIPTOR_WORDS);
    expect(hammingDistance(a, 1, b, 2)).toBe(8);
    expect(hammingDistance(b, 2, a, 1)).toBe(8);
  });
});

describe('matchDescriptors', () => {
  it('matches exact duplicates one-to-one, in query order, with distance 0', () => {
    const train = featureSet([[lowBits(32)], [lowBits(16)], [lowBits(8)]]);
    const query = featureSet([[lowBits(8)], [lowBits(32)], [lowBits(16)]]);
    expect(matchDescriptors(query, train)).toEqual([
      { queryIndex: 0, trainIndex: 2, distance: 0 },
      { queryIndex: 1, trainIndex: 0, distance: 0 },
      { queryIndex: 2, trainIndex: 1, distance: 0 },
    ]);
  });

  it('rejects an ambiguous query whose two nearest train descriptors are equally close', () => {
    const query = featureSet([[lowBits(4)]]);
    const train = featureSet([[lowBits(3)], [lowBits(5)]]);
    expect(matchDescriptors(query, train)).toEqual([]);
  });

  it('keeps a query whose best is clearly closer than its second best', () => {
    const query = featureSet([[lowBits(4)]]);
    const train = featureSet([[lowBits(3)], [lowBits(20)]]);
    expect(matchDescriptors(query, train)).toEqual([
      { queryIndex: 0, trainIndex: 0, distance: 1 },
    ]);
  });

  it('drops a pair the cross-check finds asymmetric and keeps it without cross-check', () => {
    // Train 0 is closest to query 0 (distance 1), but train 0's own best query is query 1 (distance 0).
    const query = featureSet([[lowBits(2)], [lowBits(1)]]);
    const train = featureSet([[lowBits(1)], [lowBits(30)]]);
    expect(matchDescriptors(query, train)).toEqual([
      { queryIndex: 1, trainIndex: 0, distance: 0 },
    ]);
    expect(matchDescriptors(query, train, { crossCheck: false })).toEqual([
      { queryIndex: 0, trainIndex: 0, distance: 1 },
      { queryIndex: 1, trainIndex: 0, distance: 0 },
    ]);
  });

  it('drops a best match farther than maxDistance', () => {
    const query = featureSet([[lowBits(32), lowBits(32), lowBits(32)]]);
    const train = featureSet([[0], [lowBits(32), lowBits(32), 0]]);
    expect(matchDescriptors(query, train)).toEqual([
      { queryIndex: 0, trainIndex: 1, distance: 32 },
    ]);
    expect(matchDescriptors(query, train, { maxDistance: 31 })).toEqual([]);
    expect(matchDescriptors(query, train, { maxDistance: 32 })).toHaveLength(1);
  });

  it('returns nothing when either side has no keypoints', () => {
    const some = featureSet([[1]]);
    const none = featureSet([]);
    expect(matchDescriptors(none, some)).toEqual([]);
    expect(matchDescriptors(some, none)).toEqual([]);
  });

  it('accepts a lone train descriptor when nothing competes with it', () => {
    const query = featureSet([[lowBits(6)]]);
    const train = featureSet([[lowBits(1)]]);
    expect(matchDescriptors(query, train)).toEqual([
      { queryIndex: 0, trainIndex: 0, distance: 5 },
    ]);
  });

  it('never returns a train index twice with cross-check, for any descriptors', () => {
    const descriptorArbitrary = fc.array(
      fc.integer({ min: 0, max: 2 ** 32 - 1 }),
      { minLength: DESCRIPTOR_WORDS, maxLength: DESCRIPTOR_WORDS },
    );
    const setArbitrary = fc
      .array(descriptorArbitrary, { minLength: 0, maxLength: 12 })
      .map(featureSet);
    fc.assert(
      fc.property(setArbitrary, setArbitrary, (query, train) => {
        const matches = matchDescriptors(query, train, {
          maxDistance: 256,
          ratio: 1,
        });
        const trainIndices = matches.map((match) => match.trainIndex);
        expect(new Set(trainIndices).size).toBe(trainIndices.length);
        for (const match of matches) {
          expect(match.distance).toBe(
            hammingDistance(
              query.descriptors,
              match.queryIndex,
              train.descriptors,
              match.trainIndex,
            ),
          );
        }
      }),
    );
  });

  it('exposes the documented defaults', () => {
    expect(DEFAULT_MATCH_OPTIONS).toEqual({
      ratio: 0.8,
      crossCheck: true,
      maxDistance: 80,
    });
  });
});
