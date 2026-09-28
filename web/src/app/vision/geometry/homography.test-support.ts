import fc from 'fast-check';

import type { Homography, Point } from '../types';
import { applyHomography } from './homography';
import { createRandom } from './ransac';

/** A camera motion small enough for a handheld burst, from which a sane homography is built. */
export interface Motion {
  readonly angle: number;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly perspectiveX: number;
  readonly perspectiveY: number;
}

/** Returns the homography rotating by `angle`, scaling, translating and adding the given perspective terms. */
export function homographyFromMotion(motion: Motion): Homography {
  const cosine = Math.cos(motion.angle) * motion.scale;
  const sine = Math.sin(motion.angle) * motion.scale;
  return new Float64Array([
    cosine,
    -sine,
    motion.translateX,
    sine,
    cosine,
    motion.translateY,
    motion.perspectiveX,
    motion.perspectiveY,
    1,
  ]);
}

/** Returns a pure translation homography. */
export function translationHomography(x: number, y: number): Homography {
  return new Float64Array([1, 0, x, 0, 1, y, 0, 0, 1]);
}

function finiteDouble(min: number, max: number): fc.Arbitrary<number> {
  return fc.double({ min, max, noNaN: true });
}

export const saneMotionArbitrary: fc.Arbitrary<Motion> = fc.record({
  angle: finiteDouble(-0.1, 0.1),
  scale: finiteDouble(0.8, 1.25),
  translateX: finiteDouble(-40, 40),
  translateY: finiteDouble(-40, 40),
  perspectiveX: finiteDouble(-1e-5, 1e-5),
  perspectiveY: finiteDouble(-1e-5, 1e-5),
});

export const saneHomographyArbitrary: fc.Arbitrary<Homography> =
  saneMotionArbitrary.map(homographyFromMotion);

/** Points within a `range × range` frame. */
export function pointArbitrary(range: number): fc.Arbitrary<Point> {
  return fc.record({ x: finiteDouble(0, range), y: finiteDouble(0, range) });
}

/** Returns `count` seeded pseudo-random points inside `width × height`. */
export function scatterPoints(
  count: number,
  width: number,
  height: number,
  seed = 7,
): Point[] {
  const random = createRandom(seed);
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    points.push({ x: random() * width, y: random() * height });
  }
  return points;
}

/** Returns every point mapped through `h`. */
export function mapPoints(h: Homography, points: readonly Point[]): Point[] {
  return points.map((point) => applyHomography(h, point));
}

/** Returns the largest distance between where `actual` and `expected` send each of `points`. */
export function maxTransferDifference(
  actual: Homography,
  expected: Homography,
  points: readonly Point[],
): number {
  let largest = 0;
  for (const point of points) {
    const a = applyHomography(actual, point);
    const b = applyHomography(expected, point);
    largest = Math.max(largest, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return largest;
}
