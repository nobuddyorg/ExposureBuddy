import type { EffectParams } from '../vision/effects/effectParams';
import type {
  SingleStage,
  SingleWorkerResponse,
} from '../vision/pipeline/singleProtocol';
import type { RgbaImage } from '../vision/types';
import { PipelineError } from './failure';
import { request, type WorkerFactory } from './workerPort';

export interface SingleProgress {
  readonly stage: SingleStage;
  /** Bytes of the model while it downloads; else 0 of 1 as a step begins. A `total` of 0 means the size is unknown. */
  readonly done: number;
  readonly total: number;
}

export interface SingleInput {
  readonly file: Blob;
  readonly workers: WorkerFactory;
  /** The photo is decoded to fit this long edge. */
  readonly longEdge: number;
  /** Absolute URL of the folder the model and the Wasm runtime are served from. */
  readonly assetBase: string;
  readonly onProgress: (progress: SingleProgress) => void;
  readonly signal?: AbortSignal;
}

/** One photo with its people found: renders live in its worker until disposed. */
export interface SingleResult {
  readonly width: number;
  readonly height: number;
  render(params: EffectParams): Promise<RgbaImage>;
  /** The photo as it was, for comparing; named as the burst result names it, so the compare toggle serves both. */
  renderReference(): Promise<RgbaImage>;
  dispose(): void;
}

type Prepared = Extract<SingleWorkerResponse, { type: 'single-prepared' }>;
type Rendered = Extract<SingleWorkerResponse, { type: 'single-rendered' }>;

/** Finds the people in one photo on this device; rejects with a `no_people` failure when there are none. */
export async function runSinglePhoto(
  input: SingleInput,
): Promise<SingleResult> {
  const { file, workers, longEdge, assetBase, onProgress, signal } = input;
  const port = workers.createSingleWorker();
  const terminate = () => port.terminate();
  signal?.addEventListener('abort', terminate);
  let lastId = 0;
  const nextId = () => (lastId += 1);
  try {
    const prepared = await request<Prepared>(
      port,
      { type: 'single-prepare', id: nextId(), file, longEdge, assetBase },
      {
        signal,
        onProgress: (message) => {
          const { stage, done, total } = message as Extract<
            SingleWorkerResponse,
            { type: 'single-progress' }
          >;
          onProgress({ stage, done, total });
        },
      },
    );
    if (!prepared.found) throw new PipelineError({ kind: 'no_people' });
    return {
      width: prepared.width,
      height: prepared.height,
      render: async (params) =>
        (
          await request<Rendered>(
            port,
            { type: 'single-render', id: nextId(), params },
            { signal },
          )
        ).image,
      renderReference: async () =>
        (
          await request<Rendered>(
            port,
            { type: 'single-render-original', id: nextId() },
            { signal },
          )
        ).image,
      dispose: () => {
        signal?.removeEventListener('abort', terminate);
        port.terminate();
      },
    };
  } catch (error) {
    signal?.removeEventListener('abort', terminate);
    port.terminate();
    throw error;
  }
}
