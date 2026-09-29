import type { Homography, Point } from '../types';

export interface NormalisedPoints {
  /** Interleaved x, y of every point after translating to the centroid and scaling to mean distance √2. */
  readonly coordinates: Float64Array;
  /** Maps original pixels to the normalised frame. */
  readonly toNormalised: Homography;
  /** Maps the normalised frame back to original pixels. */
  readonly fromNormalised: Homography;
}

// A triple whose sine of the enclosed angle is below this counts as collinear.
const COLLINEAR_SINE = 1e-6;

/** Returns true when any three of `points` lie on one line (or coincide), which makes a 4-point homography undetermined. */
export function hasCollinearTriple(points: readonly Point[]): boolean {
  return points.some((a, first) =>
    points.some(
      (b, second) =>
        second > first &&
        points.some((c, third) => third > second && isCollinear(a, b, c)),
    ),
  );
}

function isCollinear(a: Point, b: Point, c: Point): boolean {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const acX = c.x - a.x;
  const acY = c.y - a.y;
  const cross = abX * acY - abY * acX;
  const lengths = Math.hypot(abX, abY) * Math.hypot(acX, acY);
  return Math.abs(cross) <= COLLINEAR_SINE * lengths;
}

/** Returns Hartley-normalised coordinates with both transforms, or null when all points coincide. */
export function normalisePoints(
  points: readonly Point[],
): NormalisedPoints | null {
  const count = points.length;
  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < count; index += 1) {
    centroidX += points[index].x;
    centroidY += points[index].y;
  }
  centroidX /= count;
  centroidY /= count;
  let meanDistance = 0;
  for (let index = 0; index < count; index += 1) {
    meanDistance += Math.hypot(
      points[index].x - centroidX,
      points[index].y - centroidY,
    );
  }
  meanDistance /= count;
  if (meanDistance === 0) return null;
  const scale = Math.SQRT2 / meanDistance;
  const coordinates = new Float64Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    coordinates[index * 2] = (points[index].x - centroidX) * scale;
    coordinates[index * 2 + 1] = (points[index].y - centroidY) * scale;
  }
  const toNormalised = new Float64Array([
    scale,
    0,
    -scale * centroidX,
    0,
    scale,
    -scale * centroidY,
    0,
    0,
    1,
  ]);
  const fromNormalised = new Float64Array([
    1 / scale,
    0,
    centroidX,
    0,
    1 / scale,
    centroidY,
    0,
    0,
    1,
  ]);
  return { coordinates, toNormalised, fromNormalised };
}

const HOMOGRAPHY_ENTRIES = 9;

/** Returns AᵀA (row-major 9×9) of the 2n×9 DLT system for interleaved normalised source and target coordinates. */
export function accumulateDltSystem(
  source: Float64Array,
  target: Float64Array,
): Float64Array {
  const system = new Float64Array(HOMOGRAPHY_ENTRIES * HOMOGRAPHY_ENTRIES);
  const row = new Float64Array(HOMOGRAPHY_ENTRIES);
  const count = source.length / 2;
  for (let index = 0; index < count; index += 1) {
    const x = source[index * 2];
    const y = source[index * 2 + 1];
    const u = target[index * 2];
    const v = target[index * 2 + 1];
    row.set([-x, -y, -1, 0, 0, 0, u * x, u * y, u]);
    addOuterProduct(system, row);
    row.set([0, 0, 0, -x, -y, -1, v * x, v * y, v]);
    addOuterProduct(system, row);
  }
  return system;
}

function addOuterProduct(system: Float64Array, row: Float64Array): void {
  row.forEach((rowI, i) => {
    for (let j = 0; j < HOMOGRAPHY_ENTRIES; j += 1) {
      system[i * HOMOGRAPHY_ENTRIES + j] += rowI * row[j];
    }
  });
}
