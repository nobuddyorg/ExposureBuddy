// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SingleWorkerResponse } from '../vision/pipeline/singleProtocol';
import { DEFAULT_BUDGET_BYTES } from '../vision/pipeline/budget';
import {
  createFakeFactory,
  type FakeFactory,
  type FakeHandler,
} from './fakeWorkers.test-support';
import { useSinglePhoto } from './useSinglePhoto';

const unused: FakeHandler = () => {
  throw new Error('not a burst worker');
};
const DEVICE = { poolSize: 2, budgetBytes: DEFAULT_BUDGET_BYTES };

function singleHandler(found: boolean): FakeHandler {
  return (message, post) => {
    const { id } = message;
    if (message.type !== 'single-prepare') throw new Error('unexpected');
    post({
      type: 'single-progress',
      id,
      stage: 'detect',
      done: 0,
      total: 1,
    } as SingleWorkerResponse);
    return {
      response: {
        type: 'single-prepared',
        id,
        width: 4,
        height: 4,
        found,
      } as SingleWorkerResponse,
      transfer: [],
    };
  };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

afterEach(() => vi.unstubAllEnvs());

function setup(handler: FakeHandler, device = DEVICE) {
  const factory: FakeFactory = createFakeFactory(unused, unused, handler);
  const hook = renderHook(() => useSinglePhoto(factory, device));
  return { factory, hook };
}

describe('useSinglePhoto', () => {
  it('starts idle', () => {
    expect(setup(singleHandler(true)).hook.result.current.state).toEqual({
      status: 'idle',
    });
  });

  it('runs, and ends ready with the result', async () => {
    const { hook } = setup(singleHandler(true));
    act(() => hook.result.current.start(new File(['x'], 'a.jpg')));
    expect(hook.result.current.state).toMatchObject({
      status: 'running',
      progress: { stage: 'decode', done: 0, total: 1 },
    });
    await flush();
    const { state } = hook.result.current;
    expect(state.status).toBe('ready');
    if (state.status === 'ready')
      expect([state.result.width, state.result.height]).toEqual([4, 4]);
  });

  it("asks for the size the device allows, from the app's own ml folder", async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/ExposureBuddy');
    const small = setup(singleHandler(true), {
      poolSize: 1,
      budgetBytes: DEFAULT_BUDGET_BYTES / 2,
    });
    act(() => small.hook.result.current.start(new File(['x'], 'a.jpg')));
    await flush();
    expect(small.factory.singles[0].sent[0]).toMatchObject({
      longEdge: 1024,
      assetBase: `${window.location.origin}/ExposureBuddy/ml`,
    });
  });

  it('reports a person-free photo as a failure with the stage it stopped at', async () => {
    const { hook } = setup(singleHandler(false));
    act(() => hook.result.current.start(new File(['x'], 'a.jpg')));
    await flush();
    expect(hook.result.current.state).toEqual({
      status: 'failed',
      failure: { kind: 'no_people' },
      progress: { stage: 'detect', done: 0, total: 1 },
    });
  });

  it('cancels a run in flight: back to idle, the worker ended, no failure shown', async () => {
    const { hook, factory } = setup(singleHandler(true));
    act(() => hook.result.current.start(new File(['x'], 'a.jpg')));
    act(() => hook.result.current.reset());
    await flush();
    expect(hook.result.current.state).toEqual({ status: 'idle' });
    expect(factory.singles[0].terminated).toBe(true);
  });

  it('frees the worker of a result on reset and when it unmounts', async () => {
    const { hook, factory } = setup(singleHandler(true));
    act(() => hook.result.current.start(new File(['x'], 'a.jpg')));
    await flush();
    act(() => hook.result.current.reset());
    expect(factory.singles[0].terminated).toBe(true);

    act(() => hook.result.current.start(new File(['x'], 'b.jpg')));
    await flush();
    hook.unmount();
    expect(factory.singles[1].terminated).toBe(true);
  });

  it('starting again discards the run before it', async () => {
    const { hook, factory } = setup(singleHandler(true));
    act(() => hook.result.current.start(new File(['x'], 'a.jpg')));
    await flush();
    act(() => hook.result.current.start(new File(['x'], 'b.jpg')));
    expect(factory.singles[0].terminated).toBe(true);
    await flush();
    expect(hook.result.current.state.status).toBe('ready');
  });
});
