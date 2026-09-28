import type { WorkerMessage, WorkerRequest } from '../vision/pipeline/protocol';

/** A worker as the coordinator sees it; a fake in tests, `portFromWorker` in the browser. */
export interface WorkerPort {
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void;
  /** Subscribes to every message; returns the unsubscribe. */
  onMessage(listener: (message: unknown) => void): () => void;
  terminate(): void;
}

export interface WorkerFactory {
  createAlignWorker(): WorkerPort;
  createStackWorker(): WorkerPort;
}

export interface RequestOptions {
  readonly transfer?: readonly ArrayBuffer[];
  readonly onProgress?: (message: WorkerMessage) => void;
  readonly signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException('The pipeline was cancelled.', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Posts `message` and resolves with the response echoing its id; `*-progress` messages go to `onProgress`. */
export function request<Response extends WorkerMessage>(
  port: WorkerPort,
  message: WorkerRequest,
  options: RequestOptions = {},
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const { signal } = options;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const finish = (settle: () => void) => {
      unsubscribe();
      signal?.removeEventListener('abort', onAbort);
      settle();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const unsubscribe = port.onMessage((raw) => {
      const response = raw as WorkerMessage & { message?: string };
      if (response.id !== message.id) return;
      if (response.type === 'error') {
        finish(() => reject(new Error(response.message)));
      } else if (response.type.endsWith('-progress')) {
        options.onProgress?.(response);
      } else {
        finish(() => resolve(response as Response));
      }
    });
    signal?.addEventListener('abort', onAbort);
    port.postMessage(message, options.transfer);
  });
}

/** Wraps a real `Worker` as a port. */
export function portFromWorker(worker: Worker): WorkerPort {
  return {
    postMessage: (message, transfer = []) =>
      worker.postMessage(message, [...transfer]),
    onMessage: (listener) => {
      const handler = (event: MessageEvent) => listener(event.data);
      worker.addEventListener('message', handler);
      return () => worker.removeEventListener('message', handler);
    },
    terminate: () => worker.terminate(),
  };
}
