import { dilateMask, maskCoverage } from '../effects/mask';
import {
  growRadius,
  prepareScene,
  renderScene,
  type Scene,
} from '../effects/render';
import type { DetectionDetail } from '../effects/tiles';
import type { GrayImage, RgbaImage } from '../types';
import type { Served } from './protocol';
import { transferablesOf, unexpectedRequest } from './protocol';
import type {
  SingleStage,
  SingleWorkerRequest,
  SingleWorkerResponse,
} from './singleProtocol';

/** Fewer people pixels than this share of the photo are taken for noise in the segmenter's output, not for a person. */
export const MIN_PERSON_COVERAGE = 0.002;

/** The browser-only steps, injected so the service runs in Node under test. */
export interface SingleSteps {
  decode(file: Blob, longEdge: number): Promise<RgbaImage>;
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

  return async (request) => {
    switch (request.type) {
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
