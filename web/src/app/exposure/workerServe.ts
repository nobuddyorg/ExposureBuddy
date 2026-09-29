import type { Served, WorkerMessage } from '../vision/pipeline/protocol';
import type { WorkerScope } from './workerScope';

/** Answers every message on `scope` through `handle`; a thrown error becomes an `error` response with the request's id. */
export function serveRequests<Request extends WorkerMessage, Response>(
  scope: WorkerScope,
  handle: (request: Request) => Promise<Served<Response>>,
): void {
  scope.onmessage = (event) => {
    const request = event.data as Request;
    handle(request).then(
      ({ response, transfer }) => scope.postMessage(response, transfer),
      (error: unknown) =>
        scope.postMessage({
          type: 'error',
          id: request.id,
          message: error instanceof Error ? error.message : String(error),
        }),
    );
  };
}
