'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import type { DetectionDetail } from '../vision/effects/tiles';
import { singleLongEdge } from '../vision/pipeline/budget';
import type { DeviceProfile } from './deviceProfile';
import type { FailedSingleRun } from './diagnostics';
import { toPipelineFailure } from './failure';
import { mlAssetBase } from './ml/assetBase';
import {
  runSinglePhoto,
  type SingleProgress,
  type SingleResult,
} from './runSingle';
import type { WorkerFactory } from './workerPort';

type SinglePhotoState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly progress: SingleProgress }
  | { readonly status: 'ready'; readonly result: SingleResult }
  | ({ readonly status: 'failed' } & FailedSingleRun);

export interface SinglePhotoController {
  readonly state: SinglePhotoState;
  start(file: File, detail: DetectionDetail): void;
  /** Aborts a run in flight or discards a result; either way back to idle. */
  reset(): void;
}

interface Run {
  readonly controller: AbortController;
  result: SingleResult | null;
}

const INITIAL_PROGRESS: SingleProgress = { stage: 'decode', done: 0, total: 1 };

/** Aborts the run in `activeRun`, if any, and frees its result. */
function disposeRun(activeRun: RefObject<Run | null>): void {
  const run = activeRun.current;
  if (!run) return;
  activeRun.current = null;
  run.controller.abort();
  run.result?.dispose();
}

/** Where the model and the Wasm runtime live: the app's own `ml/` folder, whatever base path it is served under. */
function assetBase(): string {
  return mlAssetBase(
    window.location.origin,
    process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  );
}

/** Drives one photo through people detection, with the size its device allows. */
export function useSinglePhoto(
  workers: WorkerFactory,
  device: DeviceProfile,
): SinglePhotoController {
  const [state, setState] = useState<SinglePhotoState>({ status: 'idle' });
  const activeRun = useRef<Run | null>(null);

  useEffect(() => () => disposeRun(activeRun), []);

  const start = (file: File, detail: DetectionDetail) => {
    disposeRun(activeRun);
    const run: Run = { controller: new AbortController(), result: null };
    activeRun.current = run;
    let lastProgress = INITIAL_PROGRESS;
    setState({ status: 'running', progress: INITIAL_PROGRESS });
    runSinglePhoto({
      file,
      workers,
      longEdge: singleLongEdge(device.budgetBytes),
      assetBase: assetBase(),
      detail,
      signal: run.controller.signal,
      onProgress: (progress) => {
        lastProgress = progress;
        setState({ status: 'running', progress });
      },
    }).then(
      (result) => {
        run.result = result;
        setState({ status: 'ready', result });
      },
      (error: unknown) => {
        if (activeRun.current !== run) return;
        activeRun.current = null;
        setState({
          status: 'failed',
          failure: toPipelineFailure(error),
          progress: lastProgress,
        });
      },
    );
  };

  const reset = () => {
    disposeRun(activeRun);
    setState({ status: 'idle' });
  };

  return { state, start, reset };
}
