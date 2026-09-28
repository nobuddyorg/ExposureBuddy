import { NO_OVERLAP_MESSAGE } from '../vision/pipeline/stackSession';
import { isAbortError } from './workerPort';

export type PipelineFailure =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'too_few_aligned'; readonly count: number }
  | { readonly kind: 'no_overlap' }
  | { readonly kind: 'decode_failed'; readonly name: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'unknown'; readonly message: string };

function describe(failure: PipelineFailure): string {
  switch (failure.kind) {
    case 'unsupported':
      return 'This browser lacks Web Workers or OffscreenCanvas.';
    case 'too_few_aligned':
      return `Only ${failure.count} photos could be aligned.`;
    case 'no_overlap':
      return 'The aligned photos share no common area.';
    case 'decode_failed':
      return `${failure.name} could not be decoded.`;
    case 'cancelled':
      return 'The pipeline was cancelled.';
    case 'unknown':
      return failure.message;
  }
}

/** A pipeline failure the screen can translate; `failure` says which. */
export class PipelineError extends Error {
  readonly failure: PipelineFailure;

  constructor(failure: PipelineFailure) {
    super(describe(failure));
    this.name = 'PipelineError';
    this.failure = failure;
  }
}

/** Classifies any thrown value: pipeline errors keep their failure, an abort is a cancellation, the rest is unknown. */
export function toPipelineFailure(error: unknown): PipelineFailure {
  if (error instanceof PipelineError) return error.failure;
  if (isAbortError(error)) return { kind: 'cancelled' };
  if (error instanceof Error && error.message === NO_OVERLAP_MESSAGE) {
    return { kind: 'no_overlap' };
  }
  return {
    kind: 'unknown',
    message: error instanceof Error ? error.message : String(error),
  };
}
