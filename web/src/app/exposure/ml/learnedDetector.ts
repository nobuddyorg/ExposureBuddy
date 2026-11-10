import { xfeatDetector } from '../../vision/features/xfeat/detect';
import { parseXFeatWeights } from '../../vision/features/xfeat/net';
import type { DetectLearned } from '../../vision/pipeline/learnedAlignment';
import { fetchBytes } from './fetchBytes';

// Browser-only (fetch in a worker): proven by the e2e suite, not by unit tests.

/** The file with XFeat's weights, in the app's own `ml/` folder. */
const WEIGHTS_FILE = 'xfeat-core.bin';

/** Reads the learned keypoint network's weights (2.6 MB) from the app's own folder and returns the detector that runs it. */
export async function loadLearnedDetector(
  assetBase: string,
): Promise<DetectLearned> {
  const bytes = await fetchBytes(
    `${assetBase.replace(/\/$/, '')}/${WEIGHTS_FILE}`,
    () => {},
  );
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return xfeatDetector(parseXFeatWeights(copy));
}
