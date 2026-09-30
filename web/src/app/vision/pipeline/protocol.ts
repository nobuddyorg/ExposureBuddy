import type {
  AlignedFrame,
  CompositeParams,
  FeatureSet,
  Homography,
  Rect,
  RgbaImage,
  RowRange,
  Size,
} from '../types';

/** How the reference decode picks the working size (vision/pipeline/budget.ts). */
export interface WorkingSizing {
  readonly frameCount: number;
  readonly budgetBytes: number;
  readonly maxLongEdge: number;
  /** How many align workers the device could run; the budget may allow fewer. */
  readonly requestedWorkers: number;
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
    }
  | {
      readonly type: 'warp-rows';
      readonly id: number;
      readonly file: Blob;
      readonly target: Size;
      /** The transform the frame's `aligned` answer carried. */
      readonly homography: Homography;
      readonly rows: RowRange;
    };

export type AlignWorkerResponse =
  | {
      readonly type: 'reference-decoded';
      readonly id: number;
      readonly image: RgbaImage;
      readonly source: Size;
      readonly alignWorkers: number;
      readonly stripRows: number;
      readonly passes: number;
      readonly features: FeatureSet;
      /** How crisp the reference is at the alignment size; the other frames are judged against the burst's median. */
      readonly sharpness: number;
    }
  | { readonly type: 'reference-set'; readonly id: number }
  | {
      readonly type: 'aligned';
      readonly id: number;
      readonly frame: AlignedFrame;
      /** Frame → reference at the working size; a strip warps with it again. */
      readonly homography: Homography;
      readonly matches: number;
      readonly inliers: number;
      readonly sharpness: number;
    }
  | {
      readonly type: 'warped-rows';
      readonly id: number;
      readonly frame: AlignedFrame;
    }
  | {
      readonly type: 'skipped';
      readonly id: number;
      readonly matches: number;
      readonly inliers: number;
    }
  | { readonly type: 'unreadable'; readonly id: number }
  | WorkerFailure;

/** What decoding the reference yields: its pixels at the working size, the file's own dimensions, and the plan's workers and strips. */
export interface DecodedReference {
  readonly image: RgbaImage;
  readonly source: Size;
  readonly alignWorkers: number;
  readonly stripRows: number;
  readonly passes: number;
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
      readonly stripRows: number;
    }
  | {
      readonly type: 'add-frame';
      readonly id: number;
      /** The frame's place in the burst; its later strips name it again. */
      readonly index: number;
      readonly frame: AlignedFrame;
    }
  | {
      readonly type: 'drop-frame';
      readonly id: number;
      /** A frame added earlier that must not go into the stack after all; only before the crop. */
      readonly index: number;
    }
  | { readonly type: 'crop'; readonly id: number }
  | {
      readonly type: 'stack-rows';
      readonly id: number;
      readonly rows: RowRange;
    }
  | {
      readonly type: 'add-rows';
      readonly id: number;
      readonly index: number;
      readonly frame: AlignedFrame;
      readonly rows: RowRange;
    }
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
  | { readonly type: 'dropped'; readonly id: number }
  | {
      readonly type: 'stack-progress';
      readonly id: number;
      readonly fraction: number;
    }
  | ({ readonly type: 'cropped'; readonly id: number } & StackSummary)
  | { readonly type: 'stacked'; readonly id: number }
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

/** The pixel buffers inside a message, each once, so postMessage can move them instead of copying. */
export function transferablesOf(message: object): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const collect = (value: unknown): void => {
    if (ArrayBuffer.isView(value)) {
      buffers.add(value.buffer as ArrayBuffer);
      return;
    }
    if (typeof value === 'object' && value !== null)
      Object.values(value).forEach(collect);
  };
  collect(message);
  // A zero-length view shares one empty buffer across bands; moving it would detach it for every later message.
  return [...buffers].filter((buffer) => buffer.byteLength > 0);
}
