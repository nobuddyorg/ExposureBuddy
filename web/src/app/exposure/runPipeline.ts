import {
  DEFAULT_BUDGET_BYTES,
  qualityLongEdge,
  stripRanges,
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
  Homography,
  RgbaImage,
  RowRange,
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
  /** The index of the file every other one is aligned to. */
  readonly reference: number;
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
type Cropped = Extract<StackWorkerResponse, { type: 'cropped' }>;
type Rendered = Extract<StackWorkerResponse, { type: 'rendered' }>;

function pendingReport(index: number): FrameReport {
  return { index, status: 'pending', matches: 0, inliers: 0 };
}

/** Runs `task` on every item, each port taking the next item as soon as it is free; resolves when all are done. */
async function onPool<Item>(
  ports: readonly WorkerPort[],
  items: readonly Item[],
  task: (port: WorkerPort, item: Item) => Promise<void>,
): Promise<void> {
  let next = 0;
  const drain = async (port: WorkerPort) => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(port, item);
    }
  };
  await Promise.all(ports.map(drain));
}

export function countAligned(frames: readonly FrameReport[]): number {
  return frames.filter(
    (frame) => frame.status === 'aligned' || frame.status === 'reference',
  ).length;
}

export async function runPipeline(
  input: PipelineInput,
): Promise<ExposureResult> {
  const { files, reference, names, options, workers, onProgress, signal } =
    input;
  const total = files.length;
  if (total < 2)
    throw new PipelineError({ kind: 'too_few_aligned', count: total });
  if (reference < 0 || reference >= total)
    throw new RangeError(`No photo ${reference} among ${total} to align to.`);

  const frames = files.map((_, index) => pendingReport(index));
  // The transform of every frame that aligned, by burst index: a strip warps with it again.
  const homographies = new Map<number, Homography>();
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
    homographies.set(index, response.homography);
    await request(
      stack,
      { type: 'add-frame', id: nextId(), index, frame: response.frame },
      { transfer: transferablesOf(response.frame), signal },
    );
    return {
      index,
      status: 'aligned',
      matches: response.matches,
      inliers: response.inliers,
    };
  };

  // A strip after the first: every aligned frame is decoded and warped again, only those rows, and handed to the stack worker.
  const warpStrip = (target: Size, rows: RowRange, onDone: () => void) =>
    onPool(aligners, [...homographies], async (port, [index, homography]) => {
      const response = await request<AlignWorkerResponse>(
        port,
        {
          type: 'warp-rows',
          id: nextId(),
          file: files[index],
          target,
          homography,
          rows,
        },
        { signal },
      );
      if (response.type === 'unreadable')
        throw new PipelineError({ kind: 'decode_failed', name: names[index] });
      if (response.type !== 'warped-rows')
        throw new Error(`Unexpected ${response.type} while warping a strip.`);
      await request(
        stack,
        { type: 'add-rows', id: nextId(), index, frame: response.frame, rows },
        { transfer: transferablesOf(response.frame), signal },
      );
      onDone();
    });

  try {
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
        {
          type: 'add-reference',
          id: nextId(),
          image: decoded.image,
          stripRows: decoded.stripRows,
        },
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
    let done = 0;
    emit('aligning', done, order.length);
    await onPool(aligners, order, async (port, index) => {
      frames[index] = await alignOne(port, index, working);
      done += 1;
      emit('aligning', done, order.length);
    });

    const alignedCount = countAligned(frames);
    if (alignedCount < 2)
      throw new PipelineError({ kind: 'too_few_aligned', count: alignedCount });

    const summary = await request<Cropped>(
      stack,
      { type: 'crop', id: nextId() },
      { signal },
    );
    const strips = stripRanges(summary.rect, decoded.stripRows);
    // Progress in units: stacking each strip is one, and so is warping one frame again for each strip after the first.
    const units = strips.length * (1 + homographies.size) - homographies.size;
    let unitsDone = 0;
    const emitStacking = (fraction = 0) =>
      emit('stacking', Math.round(((unitsDone + fraction) / units) * 100), 100);
    emitStacking();
    for (const [position, rows] of strips.entries()) {
      if (position > 0)
        await warpStrip(working, rows, () => {
          unitsDone += 1;
          emitStacking();
        });
      // Every row the last strip needs is in the stack worker now; freeing the pool before stacking lowers the peak.
      if (position === strips.length - 1) terminateAligners();
      await request(
        stack,
        { type: 'stack-rows', id: nextId(), rows },
        {
          signal,
          onProgress: (message) =>
            emitStacking((message as StackProgress).fraction),
        },
      );
      unitsDone += 1;
    }
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
