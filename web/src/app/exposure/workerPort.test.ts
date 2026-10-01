import { getEventListeners } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { createFakePort } from './fakeWorkers.test-support';
import { isAbortError, portFromWorker, request } from './workerPort';

/** An abort that also says so, for whoever logs it. */
function isCancellation(error: unknown): boolean {
  return (
    isAbortError(error) &&
    (error as DOMException).message === 'The pipeline was cancelled.'
  );
}

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
    await request(port, { type: 'crop', id: 1 }, { onProgress });
    expect(onProgress).toHaveBeenCalledWith({
      type: 'stack-progress',
      id: 1,
      fraction: 0.5,
    });
  });

  it('keeps waiting through progress messages nobody listens for', async () => {
    const port = createFakePort((message, post) => {
      post({ type: 'stack-progress', id: message.id, fraction: 0.5 } as never);
      return { response: { type: 'stacked', id: message.id }, transfer: [] };
    });
    await expect(request(port, { type: 'crop', id: 1 })).resolves.toEqual({
      type: 'stacked',
      id: 1,
    });
  });

  it('rejects with the worker error message', async () => {
    const port = createFakePort(() => {
      throw new Error('kernel panic');
    });
    await expect(request(port, { type: 'crop', id: 1 })).rejects.toThrow(
      'kernel panic',
    );
  });

  it('rejects when the worker fails outright, and stops listening', async () => {
    const port = createFakePort(() => undefined);
    const pending = request(port, { type: 'crop', id: 1 });
    port.emitError('Failed to load worker script');
    await expect(pending).rejects.toThrow('Failed to load worker script');
    port.emit({ type: 'stacked', id: 1 });
  });

  it('passes the transfer list through', () => {
    const port = createFakePort(() => undefined);
    const buffer = new ArrayBuffer(4);
    void request(port, { type: 'crop', id: 1 }, { transfer: [buffer] });
    expect(port.transfers[0]).toEqual([buffer]);
  });

  it('rejects immediately when the signal is already aborted, without posting', async () => {
    const port = createFakePort(() => undefined);
    const controller = new AbortController();
    controller.abort();
    await expect(
      request(port, { type: 'crop', id: 1 }, { signal: controller.signal }),
    ).rejects.toSatisfy(isCancellation);
    expect(port.sent).toEqual([]);
  });

  it('lets go of the signal once settled', async () => {
    const port = createFakePort((message) => ({
      response: { type: 'done', id: message.id },
      transfer: [],
    }));
    const controller = new AbortController();
    await request(port, { type: 'crop', id: 1 }, { signal: controller.signal });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('rejects when aborted while waiting and stops listening', async () => {
    const port = createFakePort(() => undefined);
    const controller = new AbortController();
    const pending = request(
      port,
      { type: 'crop', id: 1 },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toSatisfy(isCancellation);
    // A late answer must not resurrect the settled promise or leak a listener.
    port.emit({ type: 'late', id: 1 });
  });

  it('unsubscribes once settled', async () => {
    const port = createFakePort((message) => ({
      response: { type: 'done', id: message.id },
      transfer: [],
    }));
    await request(port, { type: 'crop', id: 1 });
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
  /** A worker that is a real event target, so only the event type it fires reaches a listener. */
  function fakeWorker() {
    return Object.assign(new EventTarget(), {
      postMessage: vi.fn(),
      terminate: vi.fn(),
    });
  }
  const messageEvent = (data: string) => new MessageEvent('message', { data });
  // Node has no ErrorEvent; a bare Event with a `message` is what the handler reads either way.
  const errorEvent = (message?: string) =>
    Object.assign(new Event('error'), message === undefined ? {} : { message });

  it('forwards postMessage with a fresh transfer array', () => {
    const worker = fakeWorker();
    const port = portFromWorker(worker as unknown as Worker);
    const buffer = new ArrayBuffer(1);
    port.postMessage({ type: 'crop', id: 1 }, [buffer]);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'crop', id: 1 }, [
      buffer,
    ]);
    port.postMessage({ type: 'y', id: 2 });
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      { type: 'y', id: 2 },
      [],
    );
  });

  it("reports a worker's error event with its message, or a stand-in for a bare or empty one", () => {
    const worker = fakeWorker();
    const port = portFromWorker(worker as unknown as Worker);
    const listener = vi.fn();
    const unsubscribe = port.onError(listener);
    worker.dispatchEvent(errorEvent('boom'));
    worker.dispatchEvent(errorEvent());
    worker.dispatchEvent(errorEvent(''));
    worker.dispatchEvent(messageEvent('not an error'));
    expect(listener.mock.calls).toEqual([
      ['boom'],
      ['The worker failed to start.'],
      ['The worker failed to start.'],
    ]);
    unsubscribe();
    worker.dispatchEvent(errorEvent('late'));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('delivers event data to listeners until unsubscribed, and terminates', () => {
    const worker = fakeWorker();
    const port = portFromWorker(worker as unknown as Worker);
    const listener = vi.fn();
    const unsubscribe = port.onMessage(listener);
    worker.dispatchEvent(messageEvent('hello'));
    worker.dispatchEvent(errorEvent('boom'));
    expect(listener.mock.calls).toEqual([['hello']]);
    unsubscribe();
    worker.dispatchEvent(messageEvent('late'));
    expect(listener).toHaveBeenCalledTimes(1);
    port.terminate();
    expect(worker.terminate).toHaveBeenCalled();
  });
});
