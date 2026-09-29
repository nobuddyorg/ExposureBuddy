// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createFakeFactory,
  rgba,
  type FakeFactory,
  type FakeHandler,
} from './fakeWorkers.test-support';
import { useExposure } from './useExposure';

const WORKING = { width: 4, height: 4 };

/** An align worker that reads the file's text as its verdict: 'skip', 'bad' (as the reference), or anything else for aligned. */
function alignHandler(): FakeHandler {
  return async (request) => {
    const { id } = request;
    if (request.type === 'decode-reference') {
      if ((await (request.file as Blob).text()) === 'bad')
        return { response: { type: 'unreadable', id }, transfer: [] };
      const image = rgba(WORKING.width, WORKING.height);
      return {
        response: {
          type: 'reference-decoded',
          id,
          image,
          source: WORKING,
          features: {
            ...WORKING,
            keypoints: [],
            descriptors: new Uint32Array(0),
          },
        },
        transfer: [],
      };
    }
    if (request.type === 'set-reference')
      return { response: { type: 'reference-set', id }, transfer: [] };
    const verdict = await (request.file as Blob).text();
    if (verdict === 'skip')
      return {
        response: { type: 'skipped', id, matches: 1, inliers: 0 },
        transfer: [],
      };
    return {
      response: {
        type: 'aligned',
        id,
        frame: {
          image: rgba(WORKING.width, WORKING.height),
          coverage: new Uint8Array(16).fill(1),
        },
        matches: 9,
        inliers: 9,
      },
      transfer: [],
    };
  };
}

const stackHandler: FakeHandler = (request) => {
  const { id } = request;
  if (request.type === 'stack') {
    return {
      response: {
        type: 'stacked',
        id,
        ...WORKING,
        rect: { x: 0, y: 0, ...WORKING },
        frameCount: 2,
      },
      transfer: [],
    };
  }
  return { response: { type: 'added', id }, transfer: [] };
};

const file = (verdict: string) =>
  new File([verdict], `${verdict}.jpg`, { type: 'image/jpeg' });

const pending = { status: 'pending' };

describe('useExposure', () => {
  it('starts idle, reports progress while running, and ends ready with the result', async () => {
    const factory = createFakeFactory(alignHandler(), stackHandler);
    const { result } = renderHook(() => useExposure(factory, 4));
    expect(result.current.state.status).toBe('idle');

    act(() =>
      result.current.start([file('ok'), file('ok'), file('ok')], 'standard'),
    );
    // The pipeline's first report, one pending frame per photo, has already replaced the initial progress.
    expect(result.current.state).toMatchObject({
      status: 'running',
      progress: { stage: 'reference', frames: [pending, pending, pending] },
    });

    await vi.waitFor(() => expect(result.current.state.status).toBe('ready'));
    const { state } = result.current;
    if (state.status !== 'ready') throw new Error('unreachable');
    expect(state.result).toMatchObject({ alignedCount: 3, totalCount: 3 });
    // hardwareConcurrency 4 -> a pool of 3, capped by the two frames to align.
    expect(factory.aligners).toHaveLength(2);
  });

  it('ends failed with the classified failure', async () => {
    const factory = createFakeFactory(alignHandler(), stackHandler);
    const { result } = renderHook(() => useExposure(factory, undefined));
    act(() =>
      result.current.start([file('skip'), file('ok'), file('skip')], 'low'),
    );
    await vi.waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state).toMatchObject({
      failure: { kind: 'too_few_aligned', count: 1 },
    });
  });

  it('shows the reference stage with no frames until the pipeline reports; a lone photo is refused before it does', async () => {
    const factory = createFakeFactory(alignHandler(), stackHandler);
    const { result } = renderHook(() => useExposure(factory, 2));
    act(() => result.current.start([file('ok')], 'low'));
    expect(result.current.state).toEqual({
      status: 'running',
      progress: { stage: 'reference', done: 0, total: 1, frames: [] },
    });
    await vi.waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state).toMatchObject({
      failure: { kind: 'too_few_aligned', count: 1 },
    });
  });

  it('names the photo that could not be decoded', async () => {
    const factory = createFakeFactory(alignHandler(), stackHandler);
    const { result } = renderHook(() => useExposure(factory, 2));
    act(() =>
      result.current.start([file('ok'), file('bad'), file('ok')], 'low'),
    );
    await vi.waitFor(() => expect(result.current.state.status).toBe('failed'));
    expect(result.current.state).toMatchObject({
      failure: { kind: 'decode_failed', name: 'bad.jpg' },
    });
  });

  it('starts with the workers and concurrency of the latest render', async () => {
    const first = createFakeFactory(alignHandler(), stackHandler);
    const second = createFakeFactory(alignHandler(), stackHandler);
    const { result, rerender } = renderHook(
      (props: { factory: FakeFactory; concurrency: number }) =>
        useExposure(props.factory, props.concurrency),
      { initialProps: { factory: first, concurrency: 2 } },
    );
    rerender({ factory: second, concurrency: 5 });
    act(() =>
      result.current.start(
        [file('ok'), file('ok'), file('ok'), file('ok')],
        'low',
      ),
    );
    await vi.waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(first.stacks).toHaveLength(0);
    // hardwareConcurrency 5 -> a pool of 4, capped by the three frames to align.
    expect(second.aligners).toHaveLength(3);
  });

  it('reset during a run aborts it, stops the workers and goes back to idle', async () => {
    const factory = createFakeFactory(alignHandler(), stackHandler);
    const { result } = renderHook(() => useExposure(factory, 2));
    act(() => result.current.start([file('ok'), file('ok')], 'low'));
    act(() => result.current.reset());
    expect(result.current.state.status).toBe('idle');
    await vi.waitFor(() => expect(factory.stacks[0].terminated).toBe(true));
    // The abandoned run's rejection must not flip the state afterwards.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(result.current.state.status).toBe('idle');
  });

  it('reset after a result disposes it', async () => {
    const factory = createFakeFactory(alignHandler(), stackHandler);
    const { result } = renderHook(() => useExposure(factory, 2));
    act(() => result.current.start([file('ok'), file('ok')], 'low'));
    await vi.waitFor(() => expect(result.current.state.status).toBe('ready'));
    act(() => result.current.reset());
    expect(result.current.state.status).toBe('idle');
    expect(factory.stacks[0].terminated).toBe(true);
  });

  it('starting again aborts the earlier run and its workers', async () => {
    const factory = createFakeFactory(alignHandler(), stackHandler);
    const { result } = renderHook(() => useExposure(factory, 2));
    act(() => result.current.start([file('ok'), file('ok')], 'low'));
    act(() =>
      result.current.start([file('ok'), file('ok'), file('ok')], 'low'),
    );
    await vi.waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state).toMatchObject({ result: { totalCount: 3 } });
    expect(factory.stacks[0].terminated).toBe(true);
    expect(factory.stacks[1].terminated).toBe(false);
  });

  it('unmounting disposes the run', async () => {
    const factory = createFakeFactory(alignHandler(), stackHandler);
    const { result, unmount } = renderHook(() => useExposure(factory, 2));
    act(() => result.current.start([file('ok'), file('ok')], 'low'));
    await vi.waitFor(() => expect(result.current.state.status).toBe('ready'));
    unmount();
    expect(factory.stacks[0].terminated).toBe(true);
  });
});
