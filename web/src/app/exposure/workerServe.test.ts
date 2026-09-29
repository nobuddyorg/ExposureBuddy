import { describe, expect, it, vi } from 'vitest';

import type { WorkerScope } from './workerScope';
import { serveRequests } from './workerServe';

function fakeScope() {
  const scope: WorkerScope & { posted: unknown[][] } = {
    posted: [],
    onmessage: null,
    postMessage(message, transfer) {
      scope.posted.push([message, transfer]);
    },
  };
  return scope;
}

function deliver(scope: WorkerScope, data: unknown) {
  scope.onmessage?.({ data } as MessageEvent);
}

describe('serveRequests', () => {
  it('posts the handler response with its transfer list', async () => {
    const scope = fakeScope();
    const buffer = new ArrayBuffer(2);
    serveRequests(scope, (request: { type: string; id: number }) =>
      Promise.resolve({
        response: { type: 'done', id: request.id },
        transfer: [buffer],
      }),
    );
    deliver(scope, { type: 'work', id: 3 });
    await vi.waitFor(() => expect(scope.posted).toHaveLength(1));
    expect(scope.posted[0]).toEqual([{ type: 'done', id: 3 }, [buffer]]);
  });

  it('turns a thrown error into an error response carrying the request id', async () => {
    const scope = fakeScope();
    serveRequests(scope, () => Promise.reject(new Error('boom')));
    deliver(scope, { type: 'work', id: 9 });
    await vi.waitFor(() => expect(scope.posted).toHaveLength(1));
    expect(scope.posted[0][0]).toEqual({
      type: 'error',
      id: 9,
      message: 'boom',
    });
  });

  it('stringifies a non-Error rejection', async () => {
    const scope = fakeScope();
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a worker may reject with anything; the server must cope
    serveRequests(scope, () => Promise.reject('nope'));
    deliver(scope, { type: 'work', id: 1 });
    await vi.waitFor(() => expect(scope.posted).toHaveLength(1));
    expect(scope.posted[0][0]).toEqual({
      type: 'error',
      id: 1,
      message: 'nope',
    });
  });
});
