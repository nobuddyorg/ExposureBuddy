import type { XFeatKeypoints } from '../features/xfeat/keypoints';
import type { LearnedSteps } from './alignService';
import type { DetectLearned } from './learnedAlignment';

/** The learned steps for a test that must not reach for them. */
export const NO_LEARNING: LearnedSteps = {
  load: () =>
    Promise.reject(new Error('The learned alignment was not expected.')),
};

/**
 * Keypoints on a 6 × 5 grid of a 60 × 40 picture, every one with a descriptor of its own (a one-hot vector over 30 of the 64
 * channels): found in a reference and in a frame alike, they match one to one and fit the identity.
 */
function gridKeypoints(count = 30): XFeatKeypoints {
  const points = Array.from({ length: count }, (_, index) => ({
    x: 5 + (index % 6) * 10,
    y: 5 + Math.floor(index / 6) * 7,
  }));
  const descriptors = new Float32Array(count * 64);
  points.forEach((_, index) => {
    descriptors[index * 64 + index] = 1;
  });
  return { points, scores: points.map(() => 1), descriptors };
}

/** Learned steps whose detector always sees `count` grid keypoints, whatever the picture. */
export function gridLearning(
  count = 30,
): LearnedSteps & { readonly loaded: string[] } {
  const loaded: string[] = [];
  const detect: DetectLearned = () => gridKeypoints(count);
  return {
    loaded,
    load: async (assetBase) => {
      loaded.push(assetBase);
      return detect;
    },
  };
}
