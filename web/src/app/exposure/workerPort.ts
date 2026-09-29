import type { WorkerMessage, WorkerRequest } from '../vision/pipeline/protocol';

/** A worker as the coordinator sees it; a fake in tests, `portFromWorker` in the browser. */
export interface WorkerPort {
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void;
  /** Subscribes to every message; returns the unsubscribe. */
  onMessage(listener: (message: unknown) => void): () => void;
  /** Subscribes to the worker failing outright (a script that does not load or throws at top level). */
  onError(listener: (message: string) => void): () => void;
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
      unsubscribeError();
      signal?.removeEventListener('abort', onAbort);
      settle();
    };
    const onAbort = () => finish(() => reject(abortError()));
    // A worker that dies answers nothing, so its failure has to settle every request waiting on it.
    const unsubscribeError = port.onError((message) =>
      finish(() => reject(new Error(message))),
    );
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
    onError: (listener) => {
      // A script that fails to load fires a bare Event; one that throws at top level fires an ErrorEvent.
      const handler = (event: Event) => {
        const { message } = event as { message?: string };
        listener(message || 'The worker failed to start.');
      };
      worker.addEventListener('error', handler);
      return () => worker.removeEventListener('error', handler);
    },
    terminate: () => worker.terminate(),
  };
}
