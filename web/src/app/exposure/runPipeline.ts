import {
  DEFAULT_BUDGET_BYTES,
  qualityLongEdge,
  type OutputQuality,
} from '../vision/pipeline/budget';
import type {
  AlignWorkerResponse,
  StackProgress,
  StackWorkerResponse,
} from '../vision/pipeline/protocol';
import { transferablesOf } from '../vision/pipeline/protocol';
import type {
  CompositeParams,
  FrameReport,
  RgbaImage,
  Size,
} from '../vision/types';
import { PipelineError, toPipelineFailure } from './failure';
import { request, type WorkerFactory, type WorkerPort } from './workerPort';

export type PipelineStage =
  'reference' | 'aligning' | 'stacking' | 'compositing';

export interface PipelineProgress {
  readonly stage: PipelineStage;
  readonly done: number;
  readonly total: number;
  readonly frames: readonly FrameReport[];
}

interface PipelineOptions {
  readonly quality: OutputQuality;
  /** Align workers the device could run at once; the budget may allow fewer. The stack worker is always one more. */
  readonly poolSize: number;
  readonly budgetBytes?: number;
}

export interface PipelineInput {
  readonly files: readonly Blob[];
  /** One per file, for error messages. */
  readonly names: readonly string[];
  readonly options: PipelineOptions;
  readonly workers: WorkerFactory;
  readonly onProgress: (progress: PipelineProgress) => void;
  readonly signal?: AbortSignal;
}

/** The finished stack: renders live in its worker until disposed. */
export interface ExposureResult {
  readonly width: number;
  readonly height: number;
  readonly frames: readonly FrameReport[];
  readonly alignedCount: number;
  readonly totalCount: number;
  render(params: CompositeParams): Promise<RgbaImage>;
  renderReference(): Promise<RgbaImage>;
  dispose(): void;
}

type ReferenceDecoded = Extract<
  AlignWorkerResponse,
  { type: 'reference-decoded' }
>;
type Stacked = Extract<StackWorkerResponse, { type: 'stacked' }>;
type Rendered = Extract<StackWorkerResponse, { type: 'rendered' }>;

/** The middle of the burst: it minimises the largest camera drift to any other frame. */
export function referenceIndex(frameCount: number): number {
  return Math.floor((frameCount - 1) / 2);
}

function pendingReport(index: number): FrameReport {
  return { index, status: 'pending', matches: 0, inliers: 0 };
}

export function countAligned(frames: readonly FrameReport[]): number {
  return frames.filter(
    (frame) => frame.status === 'aligned' || frame.status === 'reference',
  ).length;
}

export async function runPipeline(
  input: PipelineInput,
): Promise<ExposureResult> {
  const { files, names, options, workers, onProgress, signal } = input;
  const total = files.length;
  if (total < 2)
    throw new PipelineError({ kind: 'too_few_aligned', count: total });

  const frames = files.map((_, index) => pendingReport(index));
  const emit = (stage: PipelineStage, done: number, outOf: number) =>
    onProgress({ stage, done, total: outOf, frames: [...frames] });
  let lastId = 0;
  const nextId = () => {
    lastId += 1;
    return lastId;
  };

  // One worker decodes the reference; how many more join depends on the photo's size and the budget.
  const aligners: WorkerPort[] = [workers.createAlignWorker()];
  const stack = workers.createStackWorker();
  const terminateAligners = () => aligners.forEach((port) => port.terminate());
  const terminateAll = () => {
    terminateAligners();
    stack.terminate();
  };
  signal?.addEventListener('abort', terminateAll);

  const decodeReference = async (index: number): Promise<ReferenceDecoded> => {
    const response = await request<AlignWorkerResponse>(
      aligners[0],
      {
        type: 'decode-reference',
        id: nextId(),
        file: files[index],
        sizing: {
          frameCount: total,
          budgetBytes: options.budgetBytes ?? DEFAULT_BUDGET_BYTES,
          maxLongEdge: qualityLongEdge(options.quality),
          requestedWorkers: options.poolSize,
        },
      },
      { signal },
    );
    if (response.type === 'unreadable') {
      throw new PipelineError({ kind: 'decode_failed', name: names[index] });
    }
    if (response.type !== 'reference-decoded') {
      throw new Error(
        `Unexpected ${response.type} while decoding the reference.`,
      );
    }
    return response;
  };

  const alignOne = async (
    port: WorkerPort,
    index: number,
    target: Size,
  ): Promise<FrameReport> => {
    const response = await request<AlignWorkerResponse>(
      port,
      { type: 'align', id: nextId(), file: files[index], target },
      { signal },
    );
    if (response.type === 'unreadable')
      return { index, status: 'unreadable', matches: 0, inliers: 0 };
    if (response.type === 'skipped') {
      return {
        index,
        status: 'skipped',
        matches: response.matches,
        inliers: response.inliers,
      };
    }
    if (response.type !== 'aligned')
      throw new Error(`Unexpected ${response.type} while aligning.`);
    await request(
      stack,
      { type: 'add-frame', id: nextId(), frame: response.frame },
      { transfer: transferablesOf(response.frame), signal },
    );
    return {
      index,
      status: 'aligned',
      matches: response.matches,
      inliers: response.inliers,
    };
  };

  try {
    const reference = referenceIndex(total);
    emit('reference', 0, 1);
    const decoded = await decodeReference(reference);
    const working: Size = {
      width: decoded.image.width,
      height: decoded.image.height,
    };
    const poolSize = Math.max(1, Math.min(decoded.alignWorkers, total - 1));
    while (aligners.length < poolSize)
      aligners.push(workers.createAlignWorker());
    frames[reference] = {
      index: reference,
      status: 'reference',
      matches: 0,
      inliers: 0,
    };
    await Promise.all([
      request(
        stack,
        { type: 'add-reference', id: nextId(), image: decoded.image },
        { transfer: transferablesOf({ image: decoded.image }), signal },
      ),
      ...aligners.map((port) =>
        request(
          port,
          { type: 'set-reference', id: nextId(), features: decoded.features },
          { signal },
        ),
      ),
    ]);

    const order = frames
      .map((frame) => frame.index)
      .filter((index) => index !== reference);
    let next = 0;
    let done = 0;
    emit('aligning', done, order.length);
    const drain = async (port: WorkerPort) => {
      while (next < order.length) {
        const index = order[next];
        next += 1;
        frames[index] = await alignOne(port, index, working);
        done += 1;
        emit('aligning', done, order.length);
      }
    };
    await Promise.all(aligners.map(drain));

    const alignedCount = countAligned(frames);
    if (alignedCount < 2)
      throw new PipelineError({ kind: 'too_few_aligned', count: alignedCount });
    // Their buffers are in the stack worker now; freeing the pool before stacking halves peak memory.
    terminateAligners();

    emit('stacking', 0, 100);
    const summary = await request<Stacked>(
      stack,
      { type: 'stack', id: nextId() },
      {
        signal,
        onProgress: (message) =>
          emit(
            'stacking',
            Math.round((message as StackProgress).fraction * 100),
            100,
          ),
      },
    );
    emit('compositing', 0, 1);

    return {
      width: summary.rect.width,
      height: summary.rect.height,
      frames,
      alignedCount,
      totalCount: total,
      render: (params) =>
        request<Rendered>(stack, { type: 'render', id: nextId(), params }).then(
          (rendered) => rendered.image,
        ),
      renderReference: () =>
        request<Rendered>(stack, {
          type: 'render-reference',
          id: nextId(),
        }).then((rendered) => rendered.image),
      dispose: () => {
        signal?.removeEventListener('abort', terminateAll);
        stack.terminate();
      },
    };
  } catch (error) {
    terminateAll();
    throw new PipelineError(toPipelineFailure(error));
  }
}
