import type { Served, WorkerMessage } from '../vision/pipeline/protocol';
import type { WorkerFactory, WorkerPort } from './workerPort';

export type FakeHandler = (
  request: WorkerMessage & Record<string, unknown>,
  post: (message: WorkerMessage) => void,
) =>
  Served<WorkerMessage> | Promise<Served<WorkerMessage>> | Promise<void> | void;

export interface FakePort extends WorkerPort {
  readonly sent: (WorkerMessage & Record<string, unknown>)[];
  readonly transfers: (readonly ArrayBuffer[])[];
  /** How often `terminate()` was called: a real worker ignores repeats, a test can see them. */
  terminations: number;
  readonly terminated: boolean;
  /** Delivers a message as if the worker had posted it. */
  emit(message: WorkerMessage): void;
  /** Fails the worker outright, as a script that does not load would. */
  emitError(message: string): void;
}

/** A port whose worker is `handle`, answering on the next microtask like a real one would. */
export function createFakePort(handle: FakeHandler): FakePort {
  const listeners = new Set<(message: unknown) => void>();
  const errorListeners = new Set<(message: string) => void>();
  const post = (message: WorkerMessage) =>
    listeners.forEach((listener) => listener(message));
  const port: FakePort = {
    sent: [],
    transfers: [],
    terminations: 0,
    get terminated() {
      return port.terminations > 0;
    },
    emit: post,
    emitError: (message) =>
      errorListeners.forEach((listener) => listener(message)),
    postMessage(message, transfer = []) {
      const request = message as WorkerMessage & Record<string, unknown>;
      port.sent.push(request);
      port.transfers.push(transfer);
      if (port.terminated) return;
      queueMicrotask(() => {
        // A synchronous throw in the handler must become a rejection, as it would inside a real worker.
        new Promise<Awaited<ReturnType<FakeHandler>>>((resolve) =>
          resolve(handle(request, post)),
        ).then(
          (served) => {
            if (served && !port.terminated) post(served.response);
          },
          (error: unknown) =>
            post({
              type: 'error',
              id: request.id,
              message: error instanceof Error ? error.message : String(error),
            } as WorkerMessage),
        );
      });
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    terminate() {
      port.terminations += 1;
    },
  };
  return port;
}

export interface FakeFactory extends WorkerFactory {
  readonly aligners: FakePort[];
  readonly stacks: FakePort[];
}

export function createFakeFactory(
  align: FakeHandler,
  stack: FakeHandler,
): FakeFactory {
  const factory: FakeFactory = {
    aligners: [],
    stacks: [],
    createAlignWorker() {
      const port = createFakePort(align);
      factory.aligners.push(port);
      return port;
    },
    createStackWorker() {
      const port = createFakePort(stack);
      factory.stacks.push(port);
      return port;
    },
  };
  return factory;
}

export function rgba(width: number, height: number, fill = 0) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(fill),
  };
}
