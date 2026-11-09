import { detectAndDescribe } from '../features/orb';
import { isSaneHomography, scaleHomography } from '../geometry/homography';
import { ransacHomography } from '../geometry/ransac';
import { boxBlurGray } from '../image/blur';
import { rgbaToGray } from '../image/gray';
import { denoiseRadius, noiseLevel } from '../image/noiseLevel';
import { fitWithin, resizeGray } from '../image/resize';
import { sharpness } from '../image/sharpness';
import { matchDescriptors } from '../matching/hamming';
import type {
  AlignedFrame,
  FeatureSet,
  GrayImage,
  Homography,
  Point,
  RansacResult,
  RgbaImage,
  Size,
} from '../types';
import { kernelForNoise, warpRgba, type WarpKernel } from '../warp/warp';
import { ALIGNMENT_LONG_EDGE } from './budget';

/** Fewer inliers than this, or a smaller share of the matches, and the frame is skipped rather than guessed at. */
export const MIN_INLIERS = 20;
export const MIN_INLIER_RATIO = 0.25;

/** Whether `inlierCount` inliers out of `matchCount` matches are enough to trust a fit. */
export function explainsEnough(
  inlierCount: number,
  matchCount: number,
): boolean {
  return (
    inlierCount >= MIN_INLIERS && inlierCount >= MIN_INLIER_RATIO * matchCount
  );
}

export type AlignOutcome =
  | {
      readonly kind: 'aligned';
      readonly frame: AlignedFrame;
      /** Frame → reference at the working size. */
      readonly homography: Homography;
      readonly matches: number;
      readonly inliers: number;
      /** How crisp the frame is at the alignment size (image/sharpness.ts). */
      readonly sharpness: number;
      /** The sampling kernel the frame was warped with, chosen by its noise; a strip is warped with it again. */
      readonly kernel: WarpKernel;
    }
  | {
      readonly kind: 'skipped';
      readonly matches: number;
      readonly inliers: number;
    };

export interface ReferenceAnalysis {
  /** ORB features at the alignment size; the set's width/height are that size. */
  readonly features: FeatureSet;
  /** How crisp the reference is at that size, to judge the other frames against. */
  readonly sharpness: number;
}

/** ORB features of `gray`, found on a copy smoothed as far as its noise calls for: noise makes corners that no other frame has. */
function describeSmoothed(gray: GrayImage): FeatureSet {
  return detectAndDescribe(boxBlurGray(gray, denoiseRadius(noiseLevel(gray))));
}

/** The reference's features and sharpness, from one grayscale copy at the alignment size. */
export function analyseReference(image: RgbaImage): ReferenceAnalysis {
  const alignmentSize = fitWithin(image, ALIGNMENT_LONG_EDGE);
  const gray = resizeGray(rgbaToGray(image), alignmentSize);
  return {
    features: describeSmoothed(gray),
    sharpness: sharpness(gray),
  };
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
  const features = describeSmoothed(gray);
  const matches = matchDescriptors(features, reference);
  // Even a perfect fit could not be trusted on too few matches, so none is attempted.
  if (!explainsEnough(matches.length, matches.length)) {
    return skipped(matches.length, 0);
  }

  return alignFromPairs(
    { image, gray, size: reference, estimate },
    {
      source: matches.map((match) => features.keypoints[match.queryIndex]),
      target: matches.map((match) => reference.keypoints[match.trainIndex]),
    },
  );
}

/**
 * Fits a homography to `pairs` (frame point, reference point, at the alignment size `size`) and warps `image` with it; skipped when
 * the fit explains too few of the pairs or is not a sane camera move.
 */
export function alignFromPairs(
  frame: {
    readonly image: RgbaImage;
    readonly gray: GrayImage;
    readonly size: Size;
    readonly estimate: HomographyEstimator;
  },
  pairs: {
    readonly source: readonly Point[];
    readonly target: readonly Point[];
  },
): AlignOutcome {
  const { image, gray, size, estimate } = frame;
  const { source, target } = pairs;
  const fit = estimate(source, target);
  if (!fit) return skipped(source.length, 0);

  if (
    !explainsEnough(fit.inlierCount, source.length) ||
    !isSaneHomography(fit.homography, size)
  ) {
    return skipped(source.length, fit.inlierCount);
  }

  const kernel = kernelForNoise(noiseLevel(gray));
  const toWorking = scaleHomography(fit.homography, image.width / size.width);
  return {
    kind: 'aligned',
    frame: warpRgba(image, toWorking, image, kernel),
    homography: toWorking,
    matches: source.length,
    inliers: fit.inlierCount,
    sharpness: sharpness(gray),
    kernel,
  };
}
