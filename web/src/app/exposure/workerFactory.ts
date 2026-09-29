import { portFromWorker, type WorkerFactory } from './workerPort';

// Browser-only: `new URL(..., import.meta.url)` is what makes Turbopack bundle the worker as its own chunk.
// Both roles start the same script on purpose; docs/explanation/design-decisions.md says why.
const startWorker = () =>
  portFromWorker(
    new Worker(new URL('../workers/exposure.worker.ts', import.meta.url), {
      type: 'module',
    }),
  );

export const browserWorkerFactory: WorkerFactory = {
  createAlignWorker: startWorker,
  createStackWorker: startWorker,
};
