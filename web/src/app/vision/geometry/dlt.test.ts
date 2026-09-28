import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Point } from '../types';
import {
  accumulateDltSystem,
  hasCollinearTriple,
  normalisePoints,
} from './dlt';
import { applyHomography } from './homography';
import { pointArbitrary } from './homography.test-support';

describe('hasCollinearTriple', () => {
  it('is false for fewer than three points and for a proper quad', () => {
    expect(hasCollinearTriple([])).toBe(false);
    expect(
      hasCollinearTriple([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(false);
    expect(
      hasCollinearTriple([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]),
    ).toBe(false);
  });

  it('is true when any three points share a line or two coincide', () => {
    expect(
      hasCollinearTriple([
        { x: 0, y: 10 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 5, y: 9 },
      ]),
    ).toBe(true);
    expect(
      hasCollinearTriple([
        { x: 0, y: 0 },
        { x: 7, y: 3 },
        { x: 7, y: 3 },
        { x: 1, y: 9 },
      ]),
    ).toBe(true);
  });

  it('holds for any three points, two of which coincide, and never for a proper triangle', () => {
    fc.assert(
      fc.property(pointArbitrary(100), pointArbitrary(100), (a, b) => {
        expect(hasCollinearTriple([a, b, a])).toBe(true);
      }),
    );
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100, noNaN: true }),
        fc.double({ min: 1, max: 100, noNaN: true }),
        (width, height) => {
          expect(
            hasCollinearTriple([
              { x: 0, y: 0 },
              { x: width, y: 0 },
              { x: 0, y: height },
            ]),
          ).toBe(false);
        },
      ),
    );
  });
});

describe('normalisePoints', () => {
  it('centres the points and scales their mean distance to √2', () => {
    const points: Point[] = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 30 },
    ];
    const normalised = normalisePoints(points);
    expect(normalised).not.toBeNull();
    if (normalised === null) return;
    const { coordinates } = normalised;
    let sumX = 0;
    let sumY = 0;
    let meanDistance = 0;
    for (let index = 0; index < points.length; index += 1) {
      sumX += coordinates[index * 2];
      sumY += coordinates[index * 2 + 1];
      meanDistance += Math.hypot(
        coordinates[index * 2],
        coordinates[index * 2 + 1],
      );
    }
    expect(sumX).toBeCloseTo(0, 12);
    expect(sumY).toBeCloseTo(0, 12);
    expect(meanDistance / points.length).toBeCloseTo(Math.SQRT2, 12);
  });

  it('returns transforms that agree with the coordinates and undo each other, for any points', () => {
    fc.assert(
      fc.property(
        fc.array(pointArbitrary(500), { minLength: 2, maxLength: 20 }),
        (points) => {
          const normalised = normalisePoints(points);
          if (normalised === null) {
            expect(
              points.every(
                (point) => point.x === points[0].x && point.y === points[0].y,
              ),
            ).toBe(true);
            return;
          }
          points.forEach((point, index) => {
            const forward = applyHomography(normalised.toNormalised, point);
            expect(forward.x).toBeCloseTo(normalised.coordinates[index * 2], 9);
            expect(forward.y).toBeCloseTo(
              normalised.coordinates[index * 2 + 1],
              9,
            );
            const back = applyHomography(normalised.fromNormalised, forward);
            expect(back.x).toBeCloseTo(point.x, 9);
            expect(back.y).toBeCloseTo(point.y, 9);
          });
        },
      ),
    );
  });

  it('returns null when every point is the same', () => {
    expect(
      normalisePoints([
        { x: 3, y: 4 },
        { x: 3, y: 4 },
      ]),
    ).toBeNull();
  });
});

describe('accumulateDltSystem', () => {
  it('builds a symmetric 9×9 matrix that annihilates the true homography vector', () => {
    const h = [1.1, 0.1, 5, -0.1, 0.9, -3, 0.001, -0.002, 1];
    const source = new Float64Array([0, 0, 1, 0, 1, 1, 0, 1, 0.5, 0.25]);
    const target = new Float64Array(source.length);
    for (let index = 0; index < source.length / 2; index += 1) {
      const point = applyHomography(new Float64Array(h), {
        x: source[index * 2],
        y: source[index * 2 + 1],
      });
      target[index * 2] = point.x;
      target[index * 2 + 1] = point.y;
    }
    const system = accumulateDltSystem(source, target);
    expect(system).toHaveLength(81);
    for (let row = 0; row < 9; row += 1) {
      let product = 0;
      for (let column = 0; column < 9; column += 1) {
        expect(system[row * 9 + column]).toBe(system[column * 9 + row]);
        product += system[row * 9 + column] * h[column];
      }
      expect(product).toBeCloseTo(0, 9);
    }
  });

  it('is the zero matrix for no correspondences', () => {
    expect(
      Array.from(accumulateDltSystem(new Float64Array(0), new Float64Array(0))),
    ).toEqual(new Array<number>(81).fill(0));
  });
});
