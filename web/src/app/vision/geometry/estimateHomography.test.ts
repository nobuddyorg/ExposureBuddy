import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Point } from '../types';
import {
  DEFAULT_SANITY_LIMITS,
  estimateHomography,
  identityHomography,
  isSaneHomography,
} from './homography';
import {
  homographyFromMotion,
  mapPoints,
  maxTransferDifference,
  saneHomographyArbitrary,
  scatterPoints,
  translationHomography,
} from './homography.test-support';
import { createRandom } from './ransac';

const FRAME = { width: 960, height: 720 };

const KNOWN = homographyFromMotion({
  angle: 0.04,
  scale: 1.08,
  translateX: 17,
  translateY: -9,
  perspectiveX: 2e-5,
  perspectiveY: -1e-5,
});

const FOUR_CORNERS: Point[] = [
  { x: 0, y: 0 },
  { x: 900, y: 10 },
  { x: 880, y: 700 },
  { x: 20, y: 690 },
];

function withNoise(
  points: readonly Point[],
  amplitude: number,
  seed: number,
): Point[] {
  const random = createRandom(seed);
  return points.map((point) => ({
    x: point.x + (random() * 2 - 1) * amplitude,
    y: point.y + (random() * 2 - 1) * amplitude,
  }));
}

describe('estimateHomography', () => {
  it('recovers a known homography from four exact correspondences', () => {
    const estimated = estimateHomography(
      FOUR_CORNERS,
      mapPoints(KNOWN, FOUR_CORNERS),
    );
    expect(estimated).not.toBeNull();
    if (estimated === null) return;
    expect(estimated[8]).toBe(1);
    expect(
      maxTransferDifference(estimated, KNOWN, scatterPoints(50, 960, 720)),
    ).toBeLessThan(1e-6);
  });

  it('recovers a known homography from 30 correspondences with ±0.25 px noise to within 0.2 px', () => {
    const source = scatterPoints(30, 960, 720, 3);
    const target = withNoise(mapPoints(KNOWN, source), 0.25, 12);
    const estimated = estimateHomography(source, target);
    expect(estimated).not.toBeNull();
    if (estimated === null) return;
    expect(
      maxTransferDifference(estimated, KNOWN, scatterPoints(50, 960, 720)),
    ).toBeLessThan(0.2);
  });

  it('recovers any sane homography from exact scattered points', () => {
    fc.assert(
      fc.property(
        saneHomographyArbitrary,
        fc.integer({ min: 4, max: 40 }),
        (h, count) => {
          const source = scatterPoints(count, 960, 720, count);
          const estimated = estimateHomography(source, mapPoints(h, source));
          expect(estimated).not.toBeNull();
          if (estimated === null) return;
          expect(maxTransferDifference(estimated, h, source)).toBeLessThan(
            1e-5,
          );
        },
      ),
    );
  });

  it('returns null for fewer than four points', () => {
    const three = FOUR_CORNERS.slice(0, 3);
    expect(estimateHomography(three, three)).toBeNull();
    expect(estimateHomography([], [])).toBeNull();
  });

  it('throws when the point lists differ in length', () => {
    expect(() =>
      estimateHomography(FOUR_CORNERS, FOUR_CORNERS.slice(1)),
    ).toThrow(RangeError);
  });

  it('returns null when three of four source or target points are collinear', () => {
    const collinear: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 5, y: 40 },
    ];
    expect(estimateHomography(collinear, FOUR_CORNERS)).toBeNull();
    expect(estimateHomography(FOUR_CORNERS, collinear)).toBeNull();
  });

  it('returns null when every point coincides', () => {
    const same = Array.from({ length: 6 }, () => ({ x: 5, y: 5 }));
    expect(
      estimateHomography(same, FOUR_CORNERS.concat(FOUR_CORNERS.slice(0, 2))),
    ).toBeNull();
    expect(
      estimateHomography(FOUR_CORNERS.concat(FOUR_CORNERS.slice(0, 2)), same),
    ).toBeNull();
  });

  it('returns null for a rank-deficient system of more than four points on one line', () => {
    const line = Array.from({ length: 8 }, (_, index) => ({
      x: index * 10,
      y: index * 5,
    }));
    expect(estimateHomography(line, mapPoints(KNOWN, line))).toBeNull();
  });

  it('returns null when the target coordinates are not finite', () => {
    const target = mapPoints(KNOWN, FOUR_CORNERS);
    target[0] = { x: Number.POSITIVE_INFINITY, y: 0 };
    expect(estimateHomography(FOUR_CORNERS, target)).toBeNull();
  });
});

describe('isSaneHomography', () => {
  it('accepts the identity, a small translation and any sane burst motion', () => {
    expect(isSaneHomography(identityHomography(), FRAME)).toBe(true);
    expect(isSaneHomography(translationHomography(-30, 12), FRAME)).toBe(true);
    fc.assert(
      fc.property(saneHomographyArbitrary, (h) => {
        expect(isSaneHomography(h, FRAME)).toBe(true);
      }),
    );
  });

  it('rejects a mirror even though its singular values are 1', () => {
    const mirror = new Float64Array([-1, 0, FRAME.width, 0, 1, 0, 0, 0, 1]);
    expect(isSaneHomography(mirror, FRAME)).toBe(false);
  });

  it('rejects a 3× scale and a 0.5× scale but honours custom limits', () => {
    const triple = new Float64Array([3, 0, 0, 0, 3, 0, 0, 0, 1]);
    const half = new Float64Array([0.5, 0, 0, 0, 0.5, 0, 0, 0, 1]);
    expect(isSaneHomography(triple, FRAME)).toBe(false);
    expect(isSaneHomography(half, FRAME)).toBe(false);
    expect(isSaneHomography(triple, FRAME, { maxScale: 3 })).toBe(true);
    expect(isSaneHomography(half, FRAME, { minScale: 0.5 })).toBe(true);
  });

  it('rejects an anisotropic stretch whose largest singular value is out of bounds', () => {
    const stretched = new Float64Array([1.5, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(isSaneHomography(stretched, FRAME)).toBe(false);
  });

  it('rejects strong perspective on either axis', () => {
    const tiltX = new Float64Array([1, 0, 0, 0, 1, 0, 0.001, 0, 1]);
    const tiltY = new Float64Array([1, 0, 0, 0, 1, 0, 0, -0.001, 1]);
    expect(isSaneHomography(tiltX, FRAME)).toBe(false);
    expect(isSaneHomography(tiltY, FRAME)).toBe(false);
    expect(isSaneHomography(tiltX, FRAME, { maxPerspective: 0.002 })).toBe(
      true,
    );
  });

  it('rejects a homography that sends a corner behind the camera even when the limits allow its perspective', () => {
    const behind = new Float64Array([1, 0, 0, 0, 1, 0, -0.002, 0, 1]);
    expect(isSaneHomography(behind, FRAME, { maxPerspective: 0.01 })).toBe(
      false,
    );
  });

  it('rejects a non-finite matrix and one whose h[8] vanishes', () => {
    const notFinite = identityHomography();
    notFinite[2] = Number.NaN;
    expect(isSaneHomography(notFinite, FRAME)).toBe(false);
    const vanishing = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(isSaneHomography(vanishing, FRAME)).toBe(false);
  });

  it('judges an unnormalised matrix by the transform it represents', () => {
    const scaledIdentity = new Float64Array([0.1, 0, 0, 0, 0.1, 0, 0, 0, 0.1]);
    expect(isSaneHomography(scaledIdentity, FRAME)).toBe(true);
    const hiddenTriple = new Float64Array([0.3, 0, 0, 0, 0.3, 0, 0, 0, 0.1]);
    expect(isSaneHomography(hiddenTriple, FRAME)).toBe(false);
  });

  it('exposes the documented default limits', () => {
    expect(DEFAULT_SANITY_LIMITS).toEqual({
      minScale: 0.7,
      maxScale: 1.4,
      maxPerspective: 0.0005,
    });
  });
});
