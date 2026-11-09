import { alignToReference, analyseReference } from './alignment';
import type {
  AlignWorkerRequest,
  AlignWorkerResponse,
  Decoders,
  Served,
} from './protocol';
import { transferablesOf, unexpectedRequest } from './protocol';
import { warpRgba } from '../warp/warp';
import type { FeatureSet, RgbaImage, Size } from '../types';
import type { AlignOutcome } from './alignment';
import {
  alignLearned,
  analyseLearnedReference,
  type DetectLearned,
  type LearnedReference,
} from './learnedAlignment';

/** What the second, learned alignment needs from the browser: the network's weights, read from `assetBase`. */
export interface LearnedSteps {
  load(assetBase: string): Promise<DetectLearned>;
}

export type AlignService = (
  request: AlignWorkerRequest,
) => Promise<Served<AlignWorkerResponse>>;

/** Answers the align worker's requests; `isUnreadable` tells a decode failure from any other error. */
export function createAlignService(
  decoders: Decoders,
  isUnreadable: (error: unknown) => boolean,
  learned: LearnedSteps,
): AlignService {
  let reference: FeatureSet | null = null;
  let learnedReference: {
    detect: DetectLearned;
    reference: LearnedReference;
  } | null = null;

  const decodeReference = async (
    request: Extract<AlignWorkerRequest, { type: 'decode-reference' }>,
  ): Promise<Served<AlignWorkerResponse>> => {
    let decoded;
    try {
      decoded = await decoders.decodeReference(request.file, request.sizing);
    } catch (error) {
      if (isUnreadable(error)) {
        return {
          response: { type: 'unreadable', id: request.id },
          transfer: [],
        };
      }
      throw error;
    }
    const { image, source, alignWorkers, stripRows, passes } = decoded;
    const { features, sharpness } = analyseReference(image);
    return {
      response: {
        type: 'reference-decoded',
        id: request.id,
        image,
        source,
        alignWorkers,
        stripRows,
        passes,
        features,
        sharpness,
      },
      transfer: transferablesOf({ image }),
    };
  };

  /** Decodes the frame at the request's size and lines it up with `fit`; `unreadable` when it cannot be decoded. */
  const alignWith = async (
    request: {
      readonly id: number;
      readonly file: Blob;
      readonly target: Size;
    },
    fit: (image: RgbaImage) => AlignOutcome,
  ): Promise<Served<AlignWorkerResponse>> => {
    let image;
    try {
      image = await decoders.decodeAt(request.file, request.target);
    } catch (error) {
      if (isUnreadable(error)) {
        return {
          response: { type: 'unreadable', id: request.id },
          transfer: [],
        };
      }
      throw error;
    }
    const outcome = fit(image);
    const { matches, inliers } = outcome;
    if (outcome.kind === 'skipped') {
      return {
        response: { type: 'skipped', id: request.id, matches, inliers },
        transfer: [],
      };
    }
    return {
      response: {
        type: 'aligned',
        id: request.id,
        frame: outcome.frame,
        homography: outcome.homography,
        matches,
        inliers,
        sharpness: outcome.sharpness,
        kernel: outcome.kernel,
      },
      transfer: transferablesOf(outcome.frame),
    };
  };

  const align = async (
    request: Extract<AlignWorkerRequest, { type: 'align' }>,
  ): Promise<Served<AlignWorkerResponse>> => {
    if (!reference) throw new Error('set-reference must come before align.');
    const features = reference;
    return alignWith(request, (image) => alignToReference(image, features));
  };

  const learnReference = async (
    request: Extract<AlignWorkerRequest, { type: 'learned-reference' }>,
  ): Promise<Served<AlignWorkerResponse>> => {
    let image;
    try {
      image = await decoders.decodeAt(request.file, request.target);
    } catch (error) {
      if (isUnreadable(error)) {
        return {
          response: { type: 'unreadable', id: request.id },
          transfer: [],
        };
      }
      throw error;
    }
    const detect = await learned.load(request.assetBase);
    learnedReference = {
      detect,
      reference: analyseLearnedReference(image, detect),
    };
    return {
      response: { type: 'learned-reference-set', id: request.id },
      transfer: [],
    };
  };

  const alignByLearning = async (
    request: Extract<AlignWorkerRequest, { type: 'align-learned' }>,
  ): Promise<Served<AlignWorkerResponse>> => {
    if (!learnedReference)
      throw new Error('learned-reference must come before align-learned.');
    const { detect, reference: keypoints } = learnedReference;
    return alignWith(request, (image) =>
      alignLearned(image, keypoints, detect),
    );
  };

  const warpRows = async (
    request: Extract<AlignWorkerRequest, { type: 'warp-rows' }>,
  ): Promise<Served<AlignWorkerResponse>> => {
    let image;
    try {
      image = await decoders.decodeAt(request.file, request.target);
    } catch (error) {
      if (isUnreadable(error)) {
        return {
          response: { type: 'unreadable', id: request.id },
          transfer: [],
        };
      }
      throw error;
    }
    const frame = warpRgba(
      image,
      request.homography,
      { ...request.target, rows: request.rows },
      request.kernel,
    );
    return {
      response: { type: 'warped-rows', id: request.id, frame },
      transfer: transferablesOf(frame),
    };
  };

  return (request) => {
    switch (request.type) {
      case 'decode-reference':
        return decodeReference(request);
      case 'set-reference':
        reference = request.features;
        return Promise.resolve({
          response: { type: 'reference-set', id: request.id },
          transfer: [],
        });
      case 'align':
        return align(request);
      case 'learned-reference':
        return learnReference(request);
      case 'align-learned':
        return alignByLearning(request);
      case 'warp-rows':
        return warpRows(request);
      default:
        return Promise.reject(unexpectedRequest('align service', request));
    }
  };
}
