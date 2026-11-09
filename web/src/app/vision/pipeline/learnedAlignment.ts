import { mutualMatches } from '../features/xfeat/keypoints';
import type { XFeatKeypoints } from '../features/xfeat/keypoints';
import { ransacHomography } from '../geometry/ransac';
import { rgbaToGray } from '../image/gray';
import { fitWithin, resizeGray } from '../image/resize';
import type { GrayImage, RgbaImage, Size } from '../types';
import {
  alignFromPairs,
  explainsEnough,
  type AlignOutcome,
  type HomographyEstimator,
} from './alignment';
import { ALIGNMENT_LONG_EDGE } from './budget';

/** Finds the learned keypoints of a grayscale image (the XFeat network over it, with its weights already read). */
export type DetectLearned = (image: GrayImage) => XFeatKeypoints;

/** The reference's learned keypoints at the alignment size, found once for every frame that needs them. */
export interface LearnedReference {
  readonly size: Size;
  readonly keypoints: XFeatKeypoints;
}

const grayAtAlignmentSize = (image: RgbaImage, size: Size): GrayImage =>
  resizeGray(rgbaToGray(image), size);

/** The learned keypoints of the reference at the size the alignment works at. */
export function analyseLearnedReference(
  image: RgbaImage,
  detect: DetectLearned,
): LearnedReference {
  const size = fitWithin(image, ALIGNMENT_LONG_EDGE);
  return {
    size: { width: size.width, height: size.height },
    keypoints: detect(grayAtAlignmentSize(image, size)),
  };
}

/**
 * Aligns `image` to the reference by XFeat keypoints matched both ways, for a frame the corner-based alignment gave up on; the same
 * fit, the same checks and the same outcome as `alignToReference`, and `skipped` when the pairs do not hold up either.
 */
export function alignLearned(
  image: RgbaImage,
  reference: LearnedReference,
  detect: DetectLearned,
  estimate: HomographyEstimator = (source, target) =>
    ransacHomography(source, target),
): AlignOutcome {
  const gray = grayAtAlignmentSize(image, reference.size);
  const found = detect(gray);
  const pairs = mutualMatches(
    found.descriptors,
    reference.keypoints.descriptors,
  );
  if (!explainsEnough(pairs.length, pairs.length))
    return { kind: 'skipped', matches: pairs.length, inliers: 0 };
  return alignFromPairs(
    { image, gray, size: reference.size, estimate },
    {
      source: pairs.map(([own]) => found.points[own]),
      target: pairs.map(([, theirs]) => reference.keypoints.points[theirs]),
    },
  );
}
