// Browser-only: the worker global, typed narrowly so `lib: dom` and `lib: webworker` need not both be on.
export interface WorkerScope {
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export function workerScope(): WorkerScope {
  return self as unknown as WorkerScope;
}
