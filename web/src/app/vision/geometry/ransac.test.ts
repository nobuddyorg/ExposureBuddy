import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Point } from '../types';
import { transferError } from './homography';
import {
  homographyFromMotion,
  mapPoints,
  maxTransferDifference,
  scatterPoints,
  translationHomography,
} from './homography.test-support';
import {
  createRandom,
  DEFAULT_RANSAC_OPTIONS,
  DEFAULT_RANSAC_SEED,
  ransacHomography,
} from './ransac';

const TRUE_HOMOGRAPHY = homographyFromMotion({
  angle: 0.03,
  scale: 1.05,
  translateX: -14,
  translateY: 8,
  perspectiveX: 1e-5,
  perspectiveY: 2e-5,
});

interface Contaminated {
  readonly source: Point[];
  readonly target: Point[];
  /** 1 where the correspondence follows TRUE_HOMOGRAPHY. */
  readonly truth: Uint8Array;
}

// `count` correspondences, the first `outlierShare` of which are replaced by random target points.
function contaminate(
  count: number,
  outlierShare: number,
  seed: number,
): Contaminated {
  const random = createRandom(seed);
  const source = scatterPoints(count, 960, 720, seed + 1);
  const target = mapPoints(TRUE_HOMOGRAPHY, source).map((point) => ({
    x: point.x + (random() * 2 - 1) * 0.5,
    y: point.y + (random() * 2 - 1) * 0.5,
  }));
  const truth = new Uint8Array(count).fill(1);
  const outliers = Math.round(count * outlierShare);
  for (let index = 0; index < outliers; index += 1) {
    target[index] = { x: random() * 960, y: random() * 720 };
    truth[index] = 0;
  }
  return { source, target, truth };
}

describe('createRandom', () => {
  it('is deterministic per seed and stays inside [0, 1)', () => {
    const first = createRandom(42);
    const second = createRandom(42);
    const values = Array.from({ length: 1000 }, () => first());
    expect(values.map(() => second())).toEqual(values);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(new Set(values).size).toBeGreaterThan(990);
  });

  it('gives different streams for different seeds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.integer({ min: 0, max: 2 ** 31 }),
        (a, b) => {
          fc.pre(a !== b);
          const streamA = createRandom(a);
          const streamB = createRandom(b);
          const sameFirstFive = Array.from(
            { length: 5 },
            () => streamA() === streamB(),
          );
          expect(sameFirstFive.every(Boolean)).toBe(false);
        },
      ),
    );
  });
});

describe('ransacHomography', () => {
  it('recovers the homography from 100 correspondences with 40% outliers and flags the true inliers', () => {
    const { source, target, truth } = contaminate(100, 0.4, 5);
    const result = ransacHomography(source, target, {
      random: createRandom(9),
    });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.homography[8]).toBe(1);
    expect(
      maxTransferDifference(result.homography, TRUE_HOMOGRAPHY, source),
    ).toBeLessThan(0.3);
    let missedInliers = 0;
    let acceptedOutliers = 0;
    for (let index = 0; index < source.length; index += 1) {
      if (truth[index] === 1 && result.inlierMask[index] === 0)
        missedInliers += 1;
      if (truth[index] === 0 && result.inlierMask[index] === 1)
        acceptedOutliers += 1;
    }
    expect(missedInliers).toBeLessThanOrEqual(2);
    expect(acceptedOutliers).toBeLessThanOrEqual(1);
    expect(result.inlierCount).toBe(
      result.inlierMask.reduce((sum, flag) => sum + flag, 0),
    );
    expect(result.inlierCount).toBeGreaterThanOrEqual(58);
  });

  it('is reproducible: the default seed gives the same answer twice', () => {
    const { source, target } = contaminate(60, 0.3, 2);
    const first = ransacHomography(source, target);
    const second = ransacHomography(source, target);
    expect(first).toEqual(second);
    const seeded = ransacHomography(source, target, {
      random: createRandom(DEFAULT_RANSAC_SEED),
    });
    expect(seeded).toEqual(first);
  });

  it('returns null with fewer than four correspondences and throws on mismatched lengths', () => {
    const three = scatterPoints(3, 100, 100);
    expect(ransacHomography(three, three)).toBeNull();
    expect(ransacHomography([], [])).toBeNull();
    expect(() => ransacHomography(three, three.slice(1))).toThrow(
      new RangeError('ransacHomography: 3 source points but 2 target points'),
    );
  });

  it('accepts exactly four correspondences, which are their own inliers', () => {
    const source = scatterPoints(4, 300, 200, 6);
    const target = mapPoints(translationHomography(2, 1), source);
    const result = ransacHomography(source, target);
    expect(result?.inlierCount).toBe(4);
    expect(Array.from(result?.inlierMask ?? [])).toEqual([1, 1, 1, 1]);
  });

  it('keeps the best model when a later sample explains fewer correspondences', () => {
    const source = scatterPoints(8, 400, 300, 9);
    const target = mapPoints(translationHomography(3, -2), source);
    // Point 4 is an outlier; the first draw takes points 0-3, the second swaps point 4 in.
    target[4] = { x: target[4].x + 40, y: target[4].y - 25 };
    const draws = [0, 0, 0, 0, 4 / 8, 0, 0, 0];
    let call = 0;
    const random = () => draws[call++] ?? 0;
    const result = ransacHomography(source, target, {
      random,
      maxIterations: 2,
    });
    expect(result?.inlierCount).toBe(7);
    expect(result?.inlierMask[4]).toBe(0);
  });

  it('returns null when no sample can be estimated', () => {
    const line = Array.from({ length: 6 }, (_, index) => ({
      x: index,
      y: 2 * index,
    }));
    // Every sample is degenerate, so only the cap ends the search; kept small for the instrumented run.
    expect(ransacHomography(line, line, { maxIterations: 50 })).toBeNull();
  });

  it('returns exact inliers for a clean translation and stops early', () => {
    const source = scatterPoints(20, 300, 200, 4);
    const target = mapPoints(translationHomography(6, -3), source);
    let draws = 0;
    const random = createRandom(3);
    const counted = () => {
      draws += 1;
      return random();
    };
    const result = ransacHomography(source, target, { random: counted });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.inlierCount).toBe(20);
    expect(Array.from(result.inlierMask)).toEqual(
      new Array<number>(20).fill(1),
    );
    expect(
      maxTransferDifference(
        result.homography,
        translationHomography(6, -3),
        source,
      ),
    ).toBeLessThan(1e-6);
    // One outlier-free sample proves w = 1, so the adaptive bound ends the loop after that sample.
    expect(draws).toBeLessThanOrEqual(4 * 3);
  });

  it('honours the threshold: a tighter one admits fewer of the noisy correspondences', () => {
    const { source, target } = contaminate(80, 0.2, 8);
    // A tight threshold keeps the adaptive bound high, so the iterations are capped to keep the test fast under instrumentation.
    const loose = ransacHomography(source, target, {
      threshold: 3,
      maxIterations: 300,
      random: createRandom(1),
    });
    const tight = ransacHomography(source, target, {
      threshold: 0.2,
      maxIterations: 300,
      random: createRandom(1),
    });
    expect(loose).not.toBeNull();
    expect(tight).not.toBeNull();
    if (loose === null || tight === null) return;
    expect(tight.inlierCount).toBeLessThan(loose.inlierCount);
    for (let index = 0; index < source.length; index += 1) {
      const isInlier =
        transferError(loose.homography, source[index], target[index]) < 3;
      expect(loose.inlierMask[index]).toBe(isInlier ? 1 : 0);
    }
  });

  it('runs at most maxIterations samples when nothing fits', () => {
    const source = scatterPoints(30, 500, 500, 21);
    const target = scatterPoints(30, 500, 500, 22);
    let draws = 0;
    const random = createRandom(5);
    const counted = () => {
      draws += 1;
      return random();
    };
    ransacHomography(source, target, { random: counted, maxIterations: 25 });
    expect(draws).toBe(25 * 4);
  });

  it('keeps the unrefined model when least squares over the inliers explains fewer correspondences', () => {
    // 4 exact + 20 at +2.5 px + 1 at -2.5 px all fit the exact shift within 3 px; least squares drifts and loses the lone one.
    const exact = scatterPoints(4, 400, 300, 12);
    const majority = scatterPoints(20, 400, 300, 13);
    const lone = { x: 200, y: 150 };
    const source = [...exact, ...majority, lone];
    const shift = translationHomography(5, 5);
    const target = mapPoints(shift, source).map((point, index) => {
      if (index < 4) return point;
      return { x: point.x + (index === 24 ? -2.5 : 2.5), y: point.y };
    });
    // A generator stuck at 0 draws indices 0–3, the exact points, on the first sample.
    const result = ransacHomography(source, target, { random: () => 0 });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.inlierCount).toBe(25);
    expect(result.inlierMask[24]).toBe(1);
    expect(
      maxTransferDifference(result.homography, shift, source),
    ).toBeLessThan(1e-6);
  });

  it('returns null when the threshold admits not even the sample itself', () => {
    const source = scatterPoints(10, 300, 200, 4);
    expect(
      ransacHomography(source, mapPoints(translationHomography(1, 1), source), {
        threshold: 0,
        maxIterations: 50,
      }),
    ).toBeNull();
  });

  it('exposes the documented defaults', () => {
    expect(DEFAULT_RANSAC_OPTIONS).toEqual({
      threshold: 3,
      confidence: 0.995,
      maxIterations: 2000,
    });
    expect(DEFAULT_RANSAC_SEED).toBe(1);
  });
});
