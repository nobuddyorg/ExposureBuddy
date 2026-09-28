import { detectAndDescribe } from '../features/orb';
import { isSaneHomography, scaleHomography } from '../geometry/homography';
import { ransacHomography } from '../geometry/ransac';
import { rgbaToGray } from '../image/gray';
import { fitWithin, resizeGray } from '../image/resize';
import { matchDescriptors } from '../matching/hamming';
import type {
  AlignedFrame,
  FeatureSet,
  Point,
  RansacResult,
  RgbaImage,
} from '../types';
import { warpRgba } from '../warp/warp';
import { ALIGNMENT_LONG_EDGE } from './budget';

/** Fewer inliers than this, or a smaller share of the matches, and the frame is skipped rather than guessed at. */
export const MIN_INLIERS = 20;
export const MIN_INLIER_RATIO = 0.25;

export type AlignOutcome =
  | {
      readonly kind: 'aligned';
      readonly frame: AlignedFrame;
      readonly matches: number;
      readonly inliers: number;
    }
  | {
      readonly kind: 'skipped';
      readonly matches: number;
      readonly inliers: number;
    };

/** ORB features of the reference at the alignment size; the set's width/height are that size. */
export function referenceFeatures(image: RgbaImage): FeatureSet {
  const alignmentSize = fitWithin(image, ALIGNMENT_LONG_EDGE);
  return detectAndDescribe(resizeGray(rgbaToGray(image), alignmentSize));
}

export type HomographyEstimator = (
  source: readonly Point[],
  target: readonly Point[],
) => RansacResult | null;

export interface AlignOptions {
  /** The robust fit, RANSAC by default; injected so the failure paths can be driven deterministically. */
  readonly estimate: HomographyEstimator;
}

const DEFAULT_ALIGN_OPTIONS: AlignOptions = {
  estimate: (source, target) => ransacHomography(source, target),
};

function skipped(matches: number, inliers: number): AlignOutcome {
  return { kind: 'skipped', matches, inliers };
}

/** Warps `image` (same working size as the reference) into the reference frame, or reports why it could not. */
export function alignToReference(
  image: RgbaImage,
  reference: FeatureSet,
  options: Partial<AlignOptions> = {},
): AlignOutcome {
  const { estimate } = { ...DEFAULT_ALIGN_OPTIONS, ...options };
  const gray = resizeGray(rgbaToGray(image), reference);
  const features = detectAndDescribe(gray);
  const matches = matchDescriptors(features, reference);
  if (matches.length < MIN_INLIERS) return skipped(matches.length, 0);

  const source = matches.map((match) => features.keypoints[match.queryIndex]);
  const target = matches.map((match) => reference.keypoints[match.trainIndex]);
  const fit = estimate(source, target);
  if (!fit) return skipped(matches.length, 0);

  const enough =
    fit.inlierCount >= MIN_INLIERS &&
    fit.inlierCount >= MIN_INLIER_RATIO * matches.length;
  if (!enough || !isSaneHomography(fit.homography, reference)) {
    return skipped(matches.length, fit.inlierCount);
  }

  const toWorking = scaleHomography(
    fit.homography,
    image.width / reference.width,
  );
  return {
    kind: 'aligned',
    frame: warpRgba(image, toWorking, image),
    matches: matches.length,
    inliers: fit.inlierCount,
  };
}
