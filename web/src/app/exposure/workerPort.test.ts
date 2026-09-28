import { describe, expect, it, vi } from 'vitest';

import { createFakePort } from './fakeWorkers.test-support';
import { isAbortError, portFromWorker, request } from './workerPort';

describe('request', () => {
  it('resolves with the response that echoes the request id and ignores others', async () => {
    const port = createFakePort((message, post) => {
      post({ type: 'pong', id: message.id + 1 });
      return { response: { type: 'pong', id: message.id }, transfer: [] };
    });
    await expect(
      request(port, { type: 'render-reference', id: 7 }),
    ).resolves.toEqual({
      type: 'pong',
      id: 7,
    });
  });

  it('hands progress messages to onProgress and keeps waiting', async () => {
    const port = createFakePort((message, post) => {
      post({ type: 'stack-progress', id: message.id, fraction: 0.5 } as never);
      return { response: { type: 'stacked', id: message.id }, transfer: [] };
    });
    const onProgress = vi.fn();
    await request(port, { type: 'stack', id: 1 }, { onProgress });
    expect(onProgress).toHaveBeenCalledWith({
      type: 'stack-progress',
      id: 1,
      fraction: 0.5,
    });
  });

  it('rejects with the worker error message', async () => {
    const port = createFakePort(() => {
      throw new Error('kernel panic');
    });
    await expect(request(port, { type: 'stack', id: 1 })).rejects.toThrow(
      'kernel panic',
    );
  });

  it('rejects when the worker fails outright, and stops listening', async () => {
    const port = createFakePort(() => undefined);
    const pending = request(port, { type: 'stack', id: 1 });
    port.emitError('Failed to load worker script');
    await expect(pending).rejects.toThrow('Failed to load worker script');
    port.emit({ type: 'stacked', id: 1 });
  });

  it('passes the transfer list through', () => {
    const port = createFakePort(() => undefined);
    const buffer = new ArrayBuffer(4);
    void request(port, { type: 'stack', id: 1 }, { transfer: [buffer] });
    expect(port.transfers[0]).toEqual([buffer]);
  });

  it('rejects immediately when the signal is already aborted, without posting', async () => {
    const port = createFakePort(() => undefined);
    const controller = new AbortController();
    controller.abort();
    await expect(
      request(port, { type: 'stack', id: 1 }, { signal: controller.signal }),
    ).rejects.toSatisfy(isAbortError);
    expect(port.sent).toEqual([]);
  });

  it('rejects when aborted while waiting and stops listening', async () => {
    const port = createFakePort(() => undefined);
    const controller = new AbortController();
    const pending = request(
      port,
      { type: 'stack', id: 1 },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toSatisfy(isAbortError);
    // A late answer must not resurrect the settled promise or leak a listener.
    port.emit({ type: 'late', id: 1 });
  });

  it('unsubscribes once settled', async () => {
    const port = createFakePort((message) => ({
      response: { type: 'done', id: message.id },
      transfer: [],
    }));
    await request(port, { type: 'stack', id: 1 });
    const listener = vi.fn();
    port.onMessage(listener);
    port.emit({ type: 'again', id: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('isAbortError', () => {
  it('recognises only DOMException AbortError', () => {
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbortError(new DOMException('x', 'InvalidStateError'))).toBe(
      false,
    );
    expect(isAbortError(new Error('AbortError'))).toBe(false);
  });
});

describe('portFromWorker', () => {
  function fakeWorker() {
    const handlers = new Set<(event: MessageEvent) => void>();
    return {
      handlers,
      postMessage: vi.fn(),
      terminate: vi.fn(),
      addEventListener: (_: string, handler: (event: MessageEvent) => void) =>
        handlers.add(handler),
      removeEventListener: (
        _: string,
        handler: (event: MessageEvent) => void,
      ) => handlers.delete(handler),
    };
  }

  it('forwards postMessage with a fresh transfer array', () => {
    const worker = fakeWorker();
    const port = portFromWorker(worker as unknown as Worker);
    const buffer = new ArrayBuffer(1);
    port.postMessage({ type: 'stack', id: 1 }, [buffer]);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'stack', id: 1 }, [
      buffer,
    ]);
    port.postMessage({ type: 'y', id: 2 });
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      { type: 'y', id: 2 },
      [],
    );
  });

  it("reports a worker's error event with its message, or a stand-in for a bare event", () => {
    const worker = fakeWorker();
    const port = portFromWorker(worker as unknown as Worker);
    const listener = vi.fn();
    const unsubscribe = port.onError(listener);
    worker.handlers.forEach((handler) => handler({ message: 'boom' } as never));
    worker.handlers.forEach((handler) => handler({ type: 'error' } as never));
    expect(listener.mock.calls).toEqual([
      ['boom'],
      ['The worker failed to start.'],
    ]);
    unsubscribe();
    expect(worker.handlers.size).toBe(0);
  });

  it('delivers event data to listeners until unsubscribed, and terminates', () => {
    const worker = fakeWorker();
    const port = portFromWorker(worker as unknown as Worker);
    const listener = vi.fn();
    const unsubscribe = port.onMessage(listener);
    worker.handlers.forEach((handler) =>
      handler({ data: 'hello' } as MessageEvent),
    );
    expect(listener).toHaveBeenCalledWith('hello');
    unsubscribe();
    expect(worker.handlers.size).toBe(0);
    port.terminate();
    expect(worker.terminate).toHaveBeenCalled();
  });
});
