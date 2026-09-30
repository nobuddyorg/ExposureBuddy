'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import type { OutputQuality } from '../vision/pipeline/budget';
import type { DeviceProfile } from './deviceProfile';
import { toPipelineFailure, type PipelineFailure } from './failure';
import {
  runPipeline,
  type ExposureResult,
  type PipelineProgress,
} from './runPipeline';
import type { WorkerFactory } from './workerPort';

type ExposureState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly progress: PipelineProgress }
  | { readonly status: 'ready'; readonly result: ExposureResult }
  | { readonly status: 'failed'; readonly failure: PipelineFailure };

export interface ExposureController {
  readonly state: ExposureState;
  start(files: readonly File[], quality: OutputQuality): void;
  /** Aborts a run in flight or discards a result; either way back to idle. */
  reset(): void;
}

interface Run {
  readonly controller: AbortController;
  result: ExposureResult | null;
}

const INITIAL_PROGRESS: PipelineProgress = {
  stage: 'reference',
  done: 0,
  total: 1,
  frames: [],
};

/** Aborts the run in `activeRun`, if any, and frees its result. */
function disposeRun(activeRun: RefObject<Run | null>): void {
  const run = activeRun.current;
  if (!run) return;
  activeRun.current = null;
  run.controller.abort();
  run.result?.dispose();
}

/** Drives one burst through the pipeline, with as many workers and as much memory as `device` allows. */
export function useExposure(
  workers: WorkerFactory,
  device: DeviceProfile,
): ExposureController {
  const [state, setState] = useState<ExposureState>({ status: 'idle' });
  const activeRun = useRef<Run | null>(null);

  useEffect(() => () => disposeRun(activeRun), []);

  const start = useCallback(
    (files: readonly File[], quality: OutputQuality) => {
      disposeRun(activeRun);
      const run: Run = { controller: new AbortController(), result: null };
      activeRun.current = run;
      setState({ status: 'running', progress: INITIAL_PROGRESS });
      runPipeline({
        files,
        names: files.map((file) => file.name),
        options: {
          quality,
          poolSize: device.poolSize,
          budgetBytes: device.budgetBytes,
        },
        workers,
        signal: run.controller.signal,
        // Progress only reaches a live run: abandoning one terminates its workers first.
        onProgress: (progress) => setState({ status: 'running', progress }),
      }).then(
        // Only an active run can resolve: abandoning one aborts it, and an aborted run rejects.
        (result) => {
          run.result = result;
          setState({ status: 'ready', result });
        },
        (error: unknown) => {
          if (activeRun.current !== run) return;
          activeRun.current = null;
          setState({ status: 'failed', failure: toPipelineFailure(error) });
        },
      );
    },
    [device, workers],
  );

  const reset = useCallback(() => {
    disposeRun(activeRun);
    setState({ status: 'idle' });
  }, []);

  return { state, start, reset };
}
