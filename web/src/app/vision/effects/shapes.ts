import type { Point } from '../types';

/** Size in pixels of a noise feature: `longEdge` over `divisor`, never below `minimum`, so a small photo still gets visible structure. */
export function featureSize(
  longEdge: number,
  divisor: number,
  minimum: number,
): number {
  return Math.max(minimum, longEdge / divisor);
}

/** How the liquid effect moves a point: each axis by up to half of `reach` either way, from two noise values in [0, 1]. */
export function liquidOffset(
  reach: number,
  noiseX: number,
  noiseY: number,
): Point {
  return { x: (noiseX - 0.5) * reach, y: (noiseY - 0.5) * reach };
}

/** How smoke drifts at a point: sideways by up to an eighth of `reach` either way, and rising by up to a fifth of it. */
export function smokeDrift(
  reach: number,
  noiseX: number,
  noiseY: number,
): Point {
  return { x: (noiseX - 0.5) * reach * 0.25, y: reach * 0.2 * noiseY };
}

/** The share of the cloud kept at a point: wisps torn where the fine `noise` is low, the whole cloud thinned up to 40 %. */
export function smokeKeep(strength: number, noise: number): number {
  return (1 - strength * (1 - noise)) * (1 - 0.4 * strength);
}
