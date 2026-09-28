import { portFromWorker, type WorkerFactory } from './workerPort';

// Browser-only: `new URL(..., import.meta.url)` is what makes Turbopack bundle each worker as its own chunk.
export const browserWorkerFactory: WorkerFactory = {
  createAlignWorker: () =>
    portFromWorker(
      new Worker(new URL('../workers/align.worker.ts', import.meta.url), {
        type: 'module',
      }),
    ),
  createStackWorker: () =>
    portFromWorker(
      new Worker(new URL('../workers/stack.worker.ts', import.meta.url), {
        type: 'module',
      }),
    ),
};
