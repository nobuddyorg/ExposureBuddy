import { identityHomography, scaleHomography } from '../geometry/homography';
import { dilateMask, maskCoverage } from '../effects/mask';
import {
  growRadius,
  prepareScene,
  renderScene,
  type Scene,
} from '../effects/render';
import type { DetectionDetail } from '../effects/tiles';
import { warpMask } from '../effects/warpMask';
import { toRgba } from '../image/banded';
import { warpRgba } from '../warp/warp';
import type { GrayImage, Homography, RgbaImage, Size } from '../types';
import { ALIGNMENT_LONG_EDGE } from './budget';
import { spreadOut } from './blurFrames';
import { temporalDeviation, withoutStaticAreas } from './staticMovers';
import {
  addBlurredFrame,
  averageOf,
  emptySum,
  MAX_BLURRED_FRAMES,
} from './blurMovers';
import type { Served } from './protocol';
import { transferablesOf, unexpectedRequest } from './protocol';
import type {
  SingleStage,
  SingleWorkerRequest,
  SingleWorkerResponse,
} from './singleProtocol';

/** Fewer people pixels than this share of the photo are taken for noise in the segmenter's output, not for a person. */
export const MIN_PERSON_COVERAGE = 0.002;

/** How far a mover's mask is grown, as a share of the photo's long edge: the model's outline stops short of hair, shoes and soft edges. */
export const MOVER_MARGIN_SHARE = 0.012;

/** The browser-only steps, injected so the service runs in Node under test. */
export interface SingleSteps {
  decode(file: Blob, longEdge: number): Promise<RgbaImage>;
  /** The photo at exactly `size`. */
  decodeAt(file: Blob, size: Size): Promise<RgbaImage>;
  /** The mask of the people in `image`, 255 on a person; reports each stage with its progress as it goes. */
  segmentPeople(
    image: RgbaImage,
    options: {
      readonly assetBase: string;
      readonly detail: DetectionDetail;
      readonly onProgress: (
        stage: SingleStage,
        done: number,
        total: number,
      ) => void;
    },
  ): Promise<GrayImage>;
  /** One mask per image of everything that moves (people, vehicles, animals), 255 on it; the model is loaded once for all. */
  segmentMovers(
    images: readonly RgbaImage[],
    options: {
      readonly assetBase: string;
      readonly detail: DetectionDetail;
      readonly onFrame: (done: number) => void;
    },
  ): Promise<GrayImage[]>;
}

export type SingleService = (
  request: SingleWorkerRequest,
) => Promise<Served<SingleWorkerResponse>>;

interface Prepared {
  readonly image: RgbaImage;
  /** What the model found, before any growing. */
  readonly mask: GrayImage;
  readonly scene: Scene;
  /** The `grow` the scene was built with. */
  readonly grow: number;
}

/** `image` moved through `homography` onto the reference at `size`; the reference itself (the identity) is not touched. */
function alignedTo(
  image: RgbaImage,
  homography: Homography,
  size: Size,
): RgbaImage {
  const identity = identityHomography();
  if (homography.every((entry, index) => entry === identity[index]))
    return image;
  return toRgba(warpRgba(image, homography, size).image);
}

/** Answers the single-photo worker's requests: prepares one photo, then renders it with any effect, as often as asked. */
export function createSingleService(
  steps: SingleSteps,
  postProgress: (message: SingleWorkerResponse) => void,
): SingleService {
  let prepared: Prepared | null = null;

  const served = (
    response: SingleWorkerResponse,
    transfer: ArrayBuffer[] = [],
  ): Served<SingleWorkerResponse> => ({ response, transfer });

  const preparedOrThrow = (): Prepared => {
    if (!prepared) throw new Error('No photo with people has been prepared.');
    return prepared;
  };

  // The scene is rebuilt only when the mask's growth changes: the plate behind the people depends on it.
  const grownScene = (grow: number): Scene => {
    const current = preparedOrThrow();
    if (grow === current.grow) return current.scene;
    const grown = dilateMask(current.mask, growRadius(grow, current.image));
    // Growing a mask that has people never empties it, so the fallback is never used.
    const scene = prepareScene(current.image, grown) ?? current.scene;
    prepared = { ...current, scene, grow };
    return scene;
  };

  const rendered = (id: number, image: RgbaImage) =>
    served({ type: 'single-rendered', id, image }, transferablesOf(image));

  const prepare = async (
    request: Extract<SingleWorkerRequest, { type: 'single-prepare' }>,
  ) => {
    const { id } = request;
    const progress = (stage: SingleStage, done: number, total: number) =>
      postProgress({ type: 'single-progress', id, stage, done, total });
    prepared = null;
    progress('decode', 0, 1);
    const image = await steps.decode(request.file, request.longEdge);
    const mask = await steps.segmentPeople(image, {
      assetBase: request.assetBase,
      detail: request.detail,
      onProgress: progress,
    });
    progress('prepare', 0, 1);
    const scene =
      maskCoverage(mask) < MIN_PERSON_COVERAGE
        ? null
        : prepareScene(image, mask);
    if (scene) prepared = { image, mask, scene, grow: 0 };
    return served({
      type: 'single-prepared',
      id,
      width: image.width,
      height: image.height,
      found: scene !== null,
    });
  };

  // The effect of the burst: a few frames, each decoded and aligned at the working size, their movers blurred, then averaged.
  const blurredMean = async (
    request: Extract<SingleWorkerRequest, { type: 'movers-masks' }>,
    masks: readonly GrayImage[],
    onFrame: (done: number) => void,
  ): Promise<RgbaImage | undefined> => {
    const { blur, items, working } = request;
    if (!blur) return undefined;
    const chosen = spreadOut(
      items.map((_, index) => index),
      MAX_BLURRED_FRAMES,
    );
    const sum = emptySum(working);
    for (const [done, index] of chosen.entries()) {
      const decoded = await steps.decodeAt(items[index].file, working);
      const image = alignedTo(decoded, items[index].homography, working);
      addBlurredFrame(sum, { image, mask: masks[index] }, blur);
      onFrame(done + 1);
    }
    return averageOf(sum, chosen.length, working);
  };

  const findMovers = async (
    request: Extract<SingleWorkerRequest, { type: 'movers-masks' }>,
  ) => {
    const { id, items, working } = request;
    const longEdge = Math.min(
      ALIGNMENT_LONG_EDGE,
      Math.max(working.width, working.height),
    );
    const blurredCount = request.blur
      ? Math.min(items.length, MAX_BLURRED_FRAMES)
      : 0;
    const total = items.length + blurredCount;
    const frame = (done: number) =>
      postProgress({ type: 'movers-progress', id, done, total });
    frame(0);
    const images: RgbaImage[] = [];
    for (const item of items)
      images.push(await steps.decode(item.file, longEdge));
    const found = await steps.segmentMovers(images, {
      assetBase: request.assetBase,
      detail: request.detail,
      onFrame: frame,
    });
    const moved = found.map((mask, index) =>
      dilateMask(
        warpMask(
          mask,
          scaleHomography(
            items[index].homography,
            images[index].width / working.width,
          ),
        ),
        Math.max(
          1,
          Math.round(MOVER_MARGIN_SHARE * Math.max(mask.width, mask.height)),
        ),
      ),
    );
    // The model also takes statues and reliefs for people in some frames; what does not change between the frames is not a mover.
    const deviation = temporalDeviation(
      images.map((image, index) =>
        alignedTo(
          image,
          scaleHomography(items[index].homography, image.width / working.width),
          image,
        ),
      ),
    );
    const masks = moved.map((mask) => withoutStaticAreas(mask, deviation));
    const blurred = await blurredMean(request, masks, (done) =>
      frame(items.length + done),
    );
    return served(
      { type: 'movers-masked', id, masks, ...(blurred && { blurred }) },
      transferablesOf({ masks, blurred }),
    );
  };

  return async (request) => {
    switch (request.type) {
      case 'movers-masks':
        return findMovers(request);
      case 'single-prepare':
        return prepare(request);
      case 'single-render':
        return rendered(
          request.id,
          renderScene(grownScene(request.params.grow), request.params),
        );
      case 'single-render-original': {
        const { image } = preparedOrThrow();
        // A copy: the answer is moved out of the worker, and the photo has to stay for the next render.
        return rendered(request.id, {
          ...image,
          data: Uint8ClampedArray.from(image.data),
        });
      }
      default:
        throw unexpectedRequest('single-photo worker', request satisfies never);
    }
  };
}
