import { fitWithin, resizeGray } from '../../image/resize';
import type { GrayImage } from '../../types';
import { extractKeypoints, type XFeatKeypoints } from './keypoints';
import { runXFeat, type XFeatWeights } from './net';

const MULTIPLE = 32;
/** The long edge the network runs at: its cost grows with the area, and an alignment needs a few hundred good points, not the pixels. */
export const LEARNED_LONG_EDGE = 640;
export const LEARNED_TOP_K = 1500;

const down = (value: number): number =>
  Math.max(MULTIPLE, Math.floor(value / MULTIPLE) * MULTIPLE);

/** Finds a function that detects XFeat keypoints in a grayscale image, with the weights read once. */
export function xfeatDetector(
  weights: XFeatWeights,
): (image: GrayImage) => XFeatKeypoints {
  return (image) => {
    const fitted = fitWithin(image, LEARNED_LONG_EDGE);
    const size = { width: down(fitted.width), height: down(fitted.height) };
    const seen = resizeGray(image, size);
    const found = extractKeypoints(
      runXFeat(weights, seen),
      size,
      LEARNED_TOP_K,
    );
    const scaleX = image.width / size.width;
    const scaleY = image.height / size.height;
    return {
      ...found,
      points: found.points.map((point) => ({
        x: point.x * scaleX,
        y: point.y * scaleY,
      })),
    };
  };
}
