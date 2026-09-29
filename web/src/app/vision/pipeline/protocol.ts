import type {
  AlignedFrame,
  CompositeParams,
  FeatureSet,
  Rect,
  RgbaImage,
  Size,
} from '../types';

/** How the reference decode picks the working size (vision/pipeline/budget.ts). */
export interface WorkingSizing {
  readonly frameCount: number;
  readonly budgetBytes: number;
  readonly maxLongEdge: number;
}

export type AlignWorkerRequest =
  | {
      readonly type: 'decode-reference';
      readonly id: number;
      readonly file: Blob;
      readonly sizing: WorkingSizing;
    }
  | {
      readonly type: 'set-reference';
      readonly id: number;
      readonly features: FeatureSet;
    }
  | {
      readonly type: 'align';
      readonly id: number;
      readonly file: Blob;
      readonly target: Size;
    };

export type AlignWorkerResponse =
  | {
      readonly type: 'reference-decoded';
      readonly id: number;
      readonly image: RgbaImage;
      readonly source: Size;
      readonly features: FeatureSet;
    }
  | { readonly type: 'reference-set'; readonly id: number }
  | {
      readonly type: 'aligned';
      readonly id: number;
      readonly frame: AlignedFrame;
      readonly matches: number;
      readonly inliers: number;
    }
  | {
      readonly type: 'skipped';
      readonly id: number;
      readonly matches: number;
      readonly inliers: number;
    }
  | { readonly type: 'unreadable'; readonly id: number }
  | WorkerFailure;

/** What decoding the reference yields: its pixels at the working size and the file's own dimensions. */
export interface DecodedReference {
  readonly image: RgbaImage;
  readonly source: Size;
}

/** The two browser-only steps the align service needs, injected so it runs in Node under test. */
export interface Decoders {
  decodeReference(file: Blob, sizing: WorkingSizing): Promise<DecodedReference>;
  decodeAt(file: Blob, target: Size): Promise<RgbaImage>;
}

/** A response plus the buffers to move with it. */
export interface Served<Response> {
  readonly response: Response;
  readonly transfer: ArrayBuffer[];
}

export type StackWorkerRequest =
  | {
      readonly type: 'add-reference';
      readonly id: number;
      readonly image: RgbaImage;
    }
  | {
      readonly type: 'add-frame';
      readonly id: number;
      readonly frame: AlignedFrame;
    }
  | { readonly type: 'stack'; readonly id: number }
  | {
      readonly type: 'render';
      readonly id: number;
      readonly params: CompositeParams;
    }
  | { readonly type: 'render-reference'; readonly id: number };

export interface StackSummary {
  readonly width: number;
  readonly height: number;
  readonly rect: Rect;
  readonly frameCount: number;
}

export type StackWorkerResponse =
  | { readonly type: 'added'; readonly id: number }
  | {
      readonly type: 'stack-progress';
      readonly id: number;
      readonly fraction: number;
    }
  | ({ readonly type: 'stacked'; readonly id: number } & StackSummary)
  | {
      readonly type: 'rendered';
      readonly id: number;
      readonly image: RgbaImage;
    }
  | WorkerFailure;

/** Answers any request whose handler threw; `message` is the thrown error's message. */
interface WorkerFailure {
  readonly type: 'error';
  readonly id: number;
  readonly message: string;
}

export type WorkerMessage = { readonly type: string; readonly id: number };

/** The stack worker's message when no pixel is covered by every aligned frame; the coordinator maps it to its own failure. */
export const NO_OVERLAP_MESSAGE = 'The aligned photos share no common area.';

export type WorkerRequest = AlignWorkerRequest | StackWorkerRequest;
export type WorkerResponse = AlignWorkerResponse | StackWorkerResponse;

/** A message `handler` was never meant to get: names what arrived, so a misrouted port is diagnosable. */
export function unexpectedRequest(handler: string, request: unknown): Error {
  const type = (request as { type?: unknown } | null)?.type;
  return new Error(
    `The ${handler} got a request it does not know: ${String(type)}.`,
  );
}

export type StackProgress = Extract<
  StackWorkerResponse,
  { type: 'stack-progress' }
>;

function isRgbaImage(value: unknown): value is RgbaImage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as RgbaImage).data instanceof Uint8ClampedArray
  );
}

/** The pixel buffers inside a message, so postMessage can move them instead of copying. */
export function transferablesOf(message: object): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const value of Object.values(message)) {
    if (isRgbaImage(value)) buffers.push(value.data.buffer as ArrayBuffer);
    else if (value instanceof Uint8Array)
      buffers.push(value.buffer as ArrayBuffer);
    else if (
      typeof value === 'object' &&
      value !== null &&
      !ArrayBuffer.isView(value)
    )
      buffers.push(...transferablesOf(value as object));
  }
  return buffers;
}
