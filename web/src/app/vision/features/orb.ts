import { boxBlurGray } from '../image/blur';
import type { FeatureSet, GrayImage, Keypoint, Size } from '../types';
import { BRIEF_PATCH_RADIUS, computeDescriptors } from './brief';
import { detectFastCorners } from './fast';
import { intensityCentroidAngle } from './orientation';

export interface OrbOptions {
  readonly maxFeatures: number;
  readonly fastThreshold: number;
  /** Fewer corners than this at `fastThreshold` triggers a second detection at `fallbackThreshold`. */
  readonly minFeatures: number;
  readonly fallbackThreshold: number;
  readonly gridColumns: number;
  readonly gridRows: number;
  /** Box-blur radius applied before descriptor sampling. */
  readonly smoothingRadius: number;
}

export const DEFAULT_ORB_OPTIONS: OrbOptions = {
  maxFeatures: 1000,
  fastThreshold: 20,
  minFeatures: 200,
  fallbackThreshold: 8,
  gridColumns: 8,
  gridRows: 6,
  smoothingRadius: 2,
};

const FEATURE_BORDER = BRIEF_PATCH_RADIUS + 1;

/** Returns the ORB features of `image`: grid-spread FAST corners with centroid orientations and steered-BRIEF descriptors. */
export function detectAndDescribe(
  image: GrayImage,
  options: Partial<OrbOptions> = {},
): FeatureSet {
  const settings = { ...DEFAULT_ORB_OPTIONS, ...options };
  const corners = detectCornersWithFallback(image, settings);
  const spread = spreadOverGrid(corners, image, settings);
  const keypoints = spread.map((corner) => ({
    ...corner,
    angle: intensityCentroidAngle(image, corner, BRIEF_PATCH_RADIUS),
  }));
  const smoothed = boxBlurGray(image, settings.smoothingRadius);
  return {
    width: image.width,
    height: image.height,
    keypoints,
    descriptors: computeDescriptors(smoothed, keypoints),
  };
}

function detectCornersWithFallback(
  image: GrayImage,
  settings: OrbOptions,
): Keypoint[] {
  const corners = detectFastCorners(image, {
    threshold: settings.fastThreshold,
    border: FEATURE_BORDER,
  });
  if (corners.length >= settings.minFeatures) return corners;
  return detectFastCorners(image, {
    threshold: settings.fallbackThreshold,
    border: FEATURE_BORDER,
  });
}

// Keeps the strongest ceil(maxFeatures / cells) corners per grid cell, then the strongest maxFeatures of those, by score.
function spreadOverGrid(
  corners: readonly Keypoint[],
  size: Size,
  settings: OrbOptions,
): Keypoint[] {
  const { gridColumns, gridRows, maxFeatures } = settings;
  const cellCount = gridColumns * gridRows;
  const perCell = Math.ceil(maxFeatures / cellCount);
  const cells: Keypoint[][] = Array.from({ length: cellCount }, () => []);
  // A corner lies inside the border, so its cell index is always in range.
  for (const corner of corners) {
    const column = Math.floor((corner.x * gridColumns) / size.width);
    const row = Math.floor((corner.y * gridRows) / size.height);
    cells[row * gridColumns + column].push(corner);
  }
  const kept: Keypoint[] = [];
  for (const cell of cells) {
    cell.sort(byScoreDescending);
    for (let index = 0; index < cell.length && index < perCell; index += 1) {
      kept.push(cell[index]);
    }
  }
  return kept.toSorted(byScoreDescending).slice(0, maxFeatures);
}

function byScoreDescending(first: Keypoint, second: Keypoint): number {
  return second.score - first.score;
}
