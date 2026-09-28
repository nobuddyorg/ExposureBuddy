import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Homography, Point } from '../types';
import {
  applyHomography,
  composeHomographies,
  identityHomography,
  invertHomography,
  scaleHomography,
  transferError,
} from './homography';
import {
  homographyFromMotion,
  pointArbitrary,
  saneHomographyArbitrary,
  translationHomography,
} from './homography.test-support';

function expectPointClose(actual: Point, expected: Point, digits = 6): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

function expectHomographyClose(
  actual: Homography,
  expected: Homography,
  digits = 9,
): void {
  for (let index = 0; index < 9; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], digits);
  }
}

describe('identityHomography', () => {
  it('leaves any point where it is', () => {
    fc.assert(
      fc.property(pointArbitrary(1000), (point) => {
        expect(applyHomography(identityHomography(), point)).toEqual(point);
      }),
    );
  });
});

describe('applyHomography', () => {
  it('translates, rotates by 90° and divides by the perspective term', () => {
    expectPointClose(
      applyHomography(translationHomography(3, -2), { x: 1, y: 1 }),
      {
        x: 4,
        y: -1,
      },
    );
    const quarterTurn = new Float64Array([0, -1, 0, 1, 0, 0, 0, 0, 1]);
    expectPointClose(applyHomography(quarterTurn, { x: 1, y: 0 }), {
      x: 0,
      y: 1,
    });
    const perspective = new Float64Array([1, 0, 0, 0, 1, 0, 0.5, 0, 1]);
    expectPointClose(applyHomography(perspective, { x: 2, y: 4 }), {
      x: 1,
      y: 2,
    });
  });
});

describe('invertHomography', () => {
  it('returns null for a singular matrix and for the zero matrix', () => {
    expect(invertHomography(new Float64Array(9))).toBeNull();
    const rankTwo = new Float64Array([1, 2, 3, 2, 4, 6, 0, 0, 1]);
    expect(invertHomography(rankTwo)).toBeNull();
  });

  it('returns null when the matrix is not finite', () => {
    const broken = identityHomography();
    broken[0] = Number.NaN;
    expect(invertHomography(broken)).toBeNull();
  });

  it('inverts a pure translation exactly', () => {
    const inverse = invertHomography(translationHomography(5, -7)) ?? [];
    // `+ 0` turns a -0 from the cofactor arithmetic into +0 for the equality.
    expect(Array.from(inverse, (entry) => entry + 0)).toEqual(
      Array.from(translationHomography(-5, 7)),
    );
  });

  it('round-trips any point through any sane homography', () => {
    fc.assert(
      fc.property(saneHomographyArbitrary, pointArbitrary(2000), (h, point) => {
        const inverse = invertHomography(h);
        expect(inverse).not.toBeNull();
        if (inverse === null) return;
        expect(inverse[8]).toBe(1);
        expectPointClose(
          applyHomography(inverse, applyHomography(h, point)),
          point,
        );
        expectPointClose(
          applyHomography(h, applyHomography(inverse, point)),
          point,
        );
      }),
    );
  });
});

describe('composeHomographies', () => {
  it('applies inner first, then outer, for any two sane homographies and point', () => {
    fc.assert(
      fc.property(
        saneHomographyArbitrary,
        saneHomographyArbitrary,
        pointArbitrary(2000),
        (outer, inner, point) => {
          const composed = composeHomographies(outer, inner);
          expect(composed[8]).toBe(1);
          expectPointClose(
            applyHomography(composed, point),
            applyHomography(outer, applyHomography(inner, point)),
          );
        },
      ),
    );
  });

  it('composes a homography with its inverse to the identity', () => {
    const h = homographyFromMotion({
      angle: 0.05,
      scale: 1.1,
      translateX: 12,
      translateY: -3,
      perspectiveX: 1e-5,
      perspectiveY: -2e-5,
    });
    const inverse = invertHomography(h);
    expect(inverse).not.toBeNull();
    if (inverse === null) return;
    expectHomographyClose(
      composeHomographies(h, inverse),
      identityHomography(),
    );
  });

  it('leaves a product whose bottom-right entry vanishes unnormalised', () => {
    const swap = new Float64Array([0, 0, 1, 0, 1, 0, 1, 0, 0]);
    const product = composeHomographies(swap, identityHomography());
    expect(Array.from(product)).toEqual(Array.from(swap));
  });
});

describe('scaleHomography', () => {
  it('maps scaled points the way the original maps unscaled ones, for any factor', () => {
    fc.assert(
      fc.property(
        saneHomographyArbitrary,
        pointArbitrary(1000),
        fc.double({ min: 0.25, max: 4, noNaN: true }),
        (h, point, factor) => {
          const lifted = scaleHomography(h, factor);
          const expected = applyHomography(h, point);
          const actual = applyHomography(lifted, {
            x: point.x * factor,
            y: point.y * factor,
          });
          expectPointClose(
            actual,
            { x: expected.x * factor, y: expected.y * factor },
            5,
          );
        },
      ),
    );
  });

  it('is the identity for factor 1 and does not touch its input', () => {
    const h = translationHomography(4, 6);
    const same = scaleHomography(h, 1);
    expect(Array.from(same)).toEqual(Array.from(h));
    expect(same).not.toBe(h);
    expect(Array.from(scaleHomography(h, 2))).toEqual([
      1, 0, 8, 0, 1, 12, 0, 0, 1,
    ]);
  });
});

describe('transferError', () => {
  it('is 0 when the source lands on the target and the Euclidean gap otherwise', () => {
    const h = translationHomography(3, 4);
    expect(transferError(h, { x: 0, y: 0 }, { x: 3, y: 4 })).toBe(0);
    expect(transferError(h, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});
