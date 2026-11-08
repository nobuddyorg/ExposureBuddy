import { ImageSegmenter } from '@mediapipe/tasks-vision';

import { maskFromCategories } from '../../vision/effects/mask';
import type { SingleSteps } from '../../vision/pipeline/singleService';
import { DETECTION_UNSUPPORTED_MESSAGE } from '../../vision/pipeline/singleProtocol';
import { loadVisionAssets } from './mlRuntime';
import { hasWebGlInWorker } from './webGlSupport';

// Browser-only (MediaPipe in a worker): proven by the e2e suite, not by unit tests.

/** DeepLab v3 (Apache-2.0, 2.7 MB, 21 Pascal VOC classes); the person class is found by name, not by number. */
const MODEL_FILE = 'deeplab_v3.tflite';
const PERSON_LABEL = 'person';

/** The mask of the people in `image`, computed on this device from a model the app serves itself. */
export const segmentPeople: SingleSteps['segmentPeople'] = async (
  image,
  { assetBase, onProgress },
) => {
  // Before the 17 MB download: a browser that cannot run the Wasm should hear so at once.
  if (!hasWebGlInWorker(self)) throw new Error(DETECTION_UNSUPPORTED_MESSAGE);
  const assets = await loadVisionAssets(
    assetBase,
    MODEL_FILE,
    (loaded, total) => onProgress('model', loaded, total),
  );
  try {
    const segmenter = await ImageSegmenter.createFromOptions(assets.fileset, {
      baseOptions: { modelAssetBuffer: assets.model, delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    try {
      const person = segmenter.getLabels().indexOf(PERSON_LABEL);
      if (person < 0) throw new Error('The model does not know people.');
      onProgress('detect', 0, 1);
      const categories = await new Promise<Uint8Array>((resolve, reject) => {
        segmenter.segment(
          new ImageData(
            image.data as Uint8ClampedArray<ArrayBuffer>,
            image.width,
            image.height,
          ),
          (result) => {
            const mask = result.categoryMask;
            if (!mask) {
              reject(new Error('The model returned no mask.'));
              return;
            }
            resolve(Uint8Array.from(mask.getAsUint8Array()));
          },
        );
      });
      return maskFromCategories(categories, image, person);
    } finally {
      segmenter.close();
    }
  } finally {
    assets.release();
  }
};
