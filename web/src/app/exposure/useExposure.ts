'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { workerPoolSize, type OutputQuality } from '../vision/pipeline/budget';
import { toPipelineFailure, type PipelineFailure } from './failure';
import {
  runPipeline,
  type ExposureResult,
  type PipelineProgress,
} from './runPipeline';
import type { WorkerFactory } from './workerPort';

export type ExposureState =
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

/** Drives one burst through the pipeline; `hardwareConcurrency` sizes the worker pool. */
export function useExposure(
  workers: WorkerFactory,
  hardwareConcurrency: number | undefined,
): ExposureController {
  const [state, setState] = useState<ExposureState>({ status: 'idle' });
  const activeRun = useRef<Run | null>(null);

  const disposeRun = useCallback(() => {
    const run = activeRun.current;
    if (!run) return;
    activeRun.current = null;
    run.controller.abort();
    run.result?.dispose();
  }, []);

  useEffect(() => disposeRun, [disposeRun]);

  const start = useCallback(
    (files: readonly File[], quality: OutputQuality) => {
      disposeRun();
      const run: Run = { controller: new AbortController(), result: null };
      activeRun.current = run;
      setState({ status: 'running', progress: INITIAL_PROGRESS });
      runPipeline({
        files,
        names: files.map((file) => file.name),
        options: { quality, poolSize: workerPoolSize(hardwareConcurrency) },
        workers,
        signal: run.controller.signal,
        onProgress: (progress) => {
          if (activeRun.current === run)
            setState({ status: 'running', progress });
        },
      }).then(
        (result) => {
          if (activeRun.current !== run) {
            result.dispose();
            return;
          }
          run.result = result;
          setState({ status: 'ready', result });
        },
        (error: unknown) => {
          if (activeRun.current !== run) return;
          activeRun.current = null;
          const failure = toPipelineFailure(error);
          setState(
            failure.kind === 'cancelled'
              ? { status: 'idle' }
              : { status: 'failed', failure },
          );
        },
      );
    },
    [disposeRun, hardwareConcurrency, workers],
  );

  const reset = useCallback(() => {
    disposeRun();
    setState({ status: 'idle' });
  }, [disposeRun]);

  return { state, start, reset };
}
