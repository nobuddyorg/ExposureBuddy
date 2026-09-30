import { alignToReference, referenceFeatures } from './alignment';
import type {
  AlignWorkerRequest,
  AlignWorkerResponse,
  Decoders,
  Served,
} from './protocol';
import { transferablesOf, unexpectedRequest } from './protocol';
import type { FeatureSet } from '../types';

export type AlignService = (
  request: AlignWorkerRequest,
) => Promise<Served<AlignWorkerResponse>>;

/** Answers the align worker's requests; `isUnreadable` tells a decode failure from any other error. */
export function createAlignService(
  decoders: Decoders,
  isUnreadable: (error: unknown) => boolean,
): AlignService {
  let reference: FeatureSet | null = null;

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
    const { image, source, alignWorkers } = decoded;
    return {
      response: {
        type: 'reference-decoded',
        id: request.id,
        image,
        source,
        alignWorkers,
        features: referenceFeatures(image),
      },
      transfer: transferablesOf({ image }),
    };
  };

  const align = async (
    request: Extract<AlignWorkerRequest, { type: 'align' }>,
  ): Promise<Served<AlignWorkerResponse>> => {
    if (!reference) throw new Error('set-reference must come before align.');
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
    const outcome = alignToReference(image, reference);
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
        matches,
        inliers,
      },
      transfer: transferablesOf(outcome.frame),
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
      default:
        return Promise.reject(unexpectedRequest('align service', request));
    }
  };
}
