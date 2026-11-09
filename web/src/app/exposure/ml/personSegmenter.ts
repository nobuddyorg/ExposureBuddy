import { ImageSegmenter } from '@mediapipe/tasks-vision';

import type { RgbaImage } from '../../vision/types';

import { maskFromCategories } from '../../vision/effects/mask';
import {
  cropImage,
  addTileVotes,
  agreedMask,
  emptyVotes,
  segmentationTiles,
} from '../../vision/effects/tiles';
import type { SingleSteps } from '../../vision/pipeline/singleService';
import { DETECTION_UNSUPPORTED_MESSAGE } from '../../vision/pipeline/singleProtocol';
import { loadVisionAssets } from './mlRuntime';
import { hasWebGlInWorker } from './webGlSupport';

// Browser-only (MediaPipe in a worker): proven by the e2e suite, not by unit tests.

/** DeepLab v3 (Apache-2.0, 2.7 MB, 21 Pascal VOC classes); the person class is found by name, not by number. */
const MODEL_FILE = 'deeplab_v3.tflite';
const PERSON_LABEL = 'person';

/** The category of every pixel of `image`, as the model labels it. */
function segmentCategories(
  segmenter: ImageSegmenter,
  image: RgbaImage,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
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
}

/** The mask of the people in `image`, computed on this device from a model the app serves itself. */
export const segmentPeople: SingleSteps['segmentPeople'] = async (
  image,
  { assetBase, detail, onProgress },
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
      const tiles = segmentationTiles(image, detail);
      const votes = emptyVotes(image);
      // One pass over a downscaled photo loses everyone small or far away, so the model also sees every tile at its own size.
      for (const [index, tile] of tiles.entries()) {
        onProgress('detect', index, tiles.length);
        const part = cropImage(image, tile);
        const categories = await segmentCategories(segmenter, part);
        addTileVotes(votes, maskFromCategories(categories, part, person), tile);
      }
      onProgress('detect', tiles.length, tiles.length);
      return agreedMask(votes, detail);
    } finally {
      segmenter.close();
    }
  } finally {
    assets.release();
  }
};
