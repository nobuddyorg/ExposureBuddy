import { indices } from '../indices';
import type { GrayImage } from '../types';
import { areasOf } from './areas';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** One mover in one frame: where it is, and where it went next (in mask pixels). */
export interface TrackedArea {
  /** The mask pixels it covers, as indices. */
  readonly pixels: readonly number[];
  readonly centre: Point;
  /** From here to the same mover in the next sample; for the last sample, back to where it came from; zero when it was not found again. */
  readonly step: Point;
  /** Found again in the neighbouring sample within STANDING_SHARE of the long edge: it stands about. */
  readonly standing: boolean;
}

/** Areas of fewer mask pixels than this are specks, not people. */
export const MIN_TRACKED_AREA = 40;
/** The farthest a mover is taken to travel between two samples, as a share of the mask's long edge. */
export const MAX_STEP_SHARE = 0.4;
/** The most an area may grow or shrink between two samples and still be the same mover. */
export const MAX_AREA_RATIO = 3;
/** A mover that travelled less than this share of the long edge between two samples is standing. */
export const STANDING_SHARE = 0.006;

interface Area {
  readonly pixels: readonly number[];
  readonly centre: Point;
}

function centreOf(pixels: readonly number[], width: number): Point {
  let x = 0;
  let y = 0;
  for (const pixel of pixels) {
    x += pixel % width;
    y += Math.floor(pixel / width);
  }
  return { x: x / pixels.length, y: y / pixels.length };
}

function areasIn(mask: GrayImage): Area[] {
  return areasOf(mask)
    .filter((pixels) => pixels.length >= MIN_TRACKED_AREA)
    .map((pixels) => ({ pixels, centre: centreOf(pixels, mask.width) }));
}

function plausible(from: Area, to: Area, farthest: number): boolean {
  const ratio = from.pixels.length / to.pixels.length;
  return (
    ratio <= MAX_AREA_RATIO &&
    ratio >= 1 / MAX_AREA_RATIO &&
    Math.hypot(to.centre.x - from.centre.x, to.centre.y - from.centre.y) <=
      farthest
  );
}

/** For each area of `from`, the index of the area of `to` it went to, nearest pairs first; -1 where none fits. */
function matchAreas(
  from: readonly Area[],
  to: readonly Area[],
  farthest: number,
): number[] {
  const pairs = from.flatMap((source, fromIndex) =>
    to.flatMap((target, toIndex) =>
      plausible(source, target, farthest)
        ? [
            {
              fromIndex,
              toIndex,
              distance: Math.hypot(
                target.centre.x - source.centre.x,
                target.centre.y - source.centre.y,
              ),
            },
          ]
        : [],
    ),
  );
  pairs.sort((a, b) => a.distance - b.distance);
  const matched = from.map(() => -1);
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (matched[pair.fromIndex] !== -1 || taken.has(pair.toIndex)) continue;
    matched[pair.fromIndex] = pair.toIndex;
    taken.add(pair.toIndex);
  }
  return matched;
}

const NOWHERE: Point = { x: 0, y: 0 };

/**
 * The movers of every sample (a mask each, all the same size, in time order) with the way each went to the next sample.
 * The last sample's movers get the way back to where they came from.
 */
export function trackAreas(masks: readonly GrayImage[]): TrackedArea[][] {
  if (masks.length === 0) return [];
  const longEdge = Math.max(masks[0].width, masks[0].height);
  const farthest = MAX_STEP_SHARE * longEdge;
  const standingBelow = STANDING_SHARE * longEdge;
  const samples = masks.map(areasIn);
  const steps = samples.map((areas) =>
    areas.map((): Point | undefined => undefined),
  );
  for (const index of indices(samples.length - 1)) {
    const matches = matchAreas(samples[index], samples[index + 1], farthest);
    for (const [fromIndex, toIndex] of matches.entries()) {
      if (toIndex === -1) continue;
      const source = samples[index][fromIndex].centre;
      const target = samples[index + 1][toIndex].centre;
      const step = { x: target.x - source.x, y: target.y - source.y };
      steps[index][fromIndex] = step;
      // The last sample has no next one: its streak runs back along the way it came.
      if (index + 1 === samples.length - 1)
        steps[index + 1][toIndex] = { x: -step.x, y: -step.y };
    }
  }
  return samples.map((areas, index) =>
    areas.map((area, areaIndex) => {
      const step = steps[index][areaIndex];
      return {
        ...area,
        step: step ?? NOWHERE,
        standing:
          step !== undefined && Math.hypot(step.x, step.y) < standingBelow,
      };
    }),
  );
}
