import { ImageSegmenter } from '@mediapipe/tasks-vision';

import type { GrayImage, RgbaImage } from '../../vision/types';

import { maskFromAnyCategory } from '../../vision/effects/mask';
import {
  type DetectionDetail,
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
/** What can leave the scene between two shots: people, vehicles and animals; a parked car is in every frame and so stays. */
const MOVER_LABELS = [
  'person',
  'car',
  'bus',
  'motorbike',
  'bicycle',
  'train',
  'boat',
  'aeroplane',
  'bird',
  'cat',
  'cow',
  'dog',
  'horse',
  'sheep',
];

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

type OnProgress = Parameters<SingleSteps['segmentPeople']>[1]['onProgress'];

/** Opens the model (after the WebGL check, before the download), runs `run` with it, and lets everything go again. */
async function withSegmenter<Result>(
  assetBase: string,
  onProgress: OnProgress,
  run: (segmenter: ImageSegmenter) => Promise<Result>,
): Promise<Result> {
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
      return await run(segmenter);
    } finally {
      segmenter.close();
    }
  } finally {
    assets.release();
  }
}

/** The category numbers the model gives the `labels` it knows; throws when it knows none of them. */
function categoriesOf(
  segmenter: ImageSegmenter,
  labels: readonly string[],
): ReadonlySet<number> {
  const known = segmenter.getLabels();
  const wanted = new Set(
    labels.map((label) => known.indexOf(label)).filter((index) => index >= 0),
  );
  if (wanted.size === 0) throw new Error('The model knows none of the labels.');
  return wanted;
}

/** What `wanted` marks in `image`: the whole photo and its tiles each go through the model, and the vote decides. */
async function segmentVoted(
  segmenter: ImageSegmenter,
  image: RgbaImage,
  settings: {
    readonly wanted: ReadonlySet<number>;
    readonly detail: DetectionDetail;
    readonly onTile: (done: number, total: number) => void;
  },
): Promise<GrayImage> {
  const { wanted, detail, onTile } = settings;
  const tiles = segmentationTiles(image, detail);
  const votes = emptyVotes(image);
  // One pass over a downscaled photo loses everyone small or far away, so the model also sees every tile at its own size.
  for (const [index, tile] of tiles.entries()) {
    onTile(index, tiles.length);
    const part = cropImage(image, tile);
    const categories = await segmentCategories(segmenter, part);
    addTileVotes(votes, maskFromAnyCategory(categories, part, wanted), tile);
  }
  onTile(tiles.length, tiles.length);
  return agreedMask(votes, detail);
}

/** The mask of the people in `image`, computed on this device from a model the app serves itself. */
export const segmentPeople: SingleSteps['segmentPeople'] = (
  image,
  { assetBase, detail, onProgress },
) =>
  withSegmenter(assetBase, onProgress, (segmenter) =>
    segmentVoted(segmenter, image, {
      wanted: categoriesOf(segmenter, [PERSON_LABEL]),
      detail,
      onTile: (done, total) => onProgress('detect', done, total),
    }),
  );

/** The mask of everything that moves in each of `images`, one model load for all of them. */
export const segmentMovers: SingleSteps['segmentMovers'] = (
  images,
  { assetBase, detail, onFrame },
) =>
  withSegmenter(
    assetBase,
    () => {},
    async (segmenter) => {
      const wanted = categoriesOf(segmenter, MOVER_LABELS);
      const masks: GrayImage[] = [];
      for (const image of images) {
        masks.push(
          await segmentVoted(segmenter, image, {
            wanted,
            detail,
            onTile: () => {},
          }),
        );
        onFrame(masks.length);
      }
      return masks;
    },
  );
