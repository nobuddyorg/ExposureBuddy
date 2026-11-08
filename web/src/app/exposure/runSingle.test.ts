import { describe, expect, it } from 'vitest';

import type { SingleWorkerResponse } from '../vision/pipeline/singleProtocol';
import {
  createFakeFactory,
  rgba,
  type FakeHandler,
} from './fakeWorkers.test-support';
import { runSinglePhoto, type SingleProgress } from './runSingle';
import { toPipelineFailure } from './failure';

const unused: FakeHandler = () => {
  throw new Error('not a burst worker');
};

function setup(found: boolean) {
  const handler: FakeHandler = (message, post) => {
    const { id } = message;
    switch (message.type) {
      case 'single-prepare':
        post({
          type: 'single-progress',
          id,
          stage: 'model',
          done: 3,
          total: 9,
        } as SingleWorkerResponse);
        return {
          response: {
            type: 'single-prepared',
            id,
            width: 8,
            height: 6,
            found,
          } as SingleWorkerResponse,
          transfer: [],
        };
      case 'single-render':
        return {
          response: {
            type: 'single-rendered',
            id,
            image: rgba(8, 6, 7),
          } as SingleWorkerResponse,
          transfer: [],
        };
      case 'single-render-original':
        return {
          response: {
            type: 'single-rendered',
            id,
            image: rgba(8, 6, 9),
          } as SingleWorkerResponse,
          transfer: [],
        };
      default:
        throw new Error(`unexpected ${message.type}`);
    }
  };
  const workers = createFakeFactory(unused, unused, handler);
  const progress: SingleProgress[] = [];
  const run = (signal?: AbortSignal) =>
    runSinglePhoto({
      file: new Blob(['x']),
      workers,
      longEdge: 1600,
      assetBase: 'https://example.test/ml',
      onProgress: (p) => progress.push(p),
      signal,
    });
  return { workers, progress, run };
}

describe('runSinglePhoto', () => {
  it('asks one worker to prepare the photo with the size and the asset folder, and forwards its progress', async () => {
    const { workers, progress, run } = setup(true);
    await run();
    expect(workers.singles).toHaveLength(1);
    expect(workers.singles[0].sent[0]).toMatchObject({
      type: 'single-prepare',
      longEdge: 1600,
      assetBase: 'https://example.test/ml',
    });
    expect(progress).toEqual([{ stage: 'model', done: 3, total: 9 }]);
  });

  it('resolves with the photo size and renders effects and the original through the worker', async () => {
    const { workers, run } = setup(true);
    const result = await run();
    expect([result.width, result.height]).toEqual([8, 6]);
    const params = { effect: 'smoke', strength: 0.3, angle: 10 } as const;
    expect((await result.render(params)).data[0]).toBe(7);
    expect((await result.renderReference()).data[0]).toBe(9);
    expect(workers.singles[0].sent.map((m) => m.type)).toEqual([
      'single-prepare',
      'single-render',
      'single-render-original',
    ]);
    expect(workers.singles[0].sent[1]).toMatchObject({ params });
    const ids = workers.singles[0].sent.map((m) => m.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('keeps the worker alive until disposed, then ends it', async () => {
    const { workers, run } = setup(true);
    const result = await run();
    expect(workers.singles[0].terminated).toBe(false);
    result.dispose();
    expect(workers.singles[0].terminated).toBe(true);
  });

  it('fails with no_people, and ends the worker, when nobody was found', async () => {
    const { workers, run } = setup(false);
    const error = await run().catch((cause: unknown) => cause);
    expect(toPipelineFailure(error)).toEqual({ kind: 'no_people' });
    expect(workers.singles[0].terminated).toBe(true);
  });

  it('ends the worker when the signal aborts, and rejects as cancelled', async () => {
    const { workers, run } = setup(true);
    const controller = new AbortController();
    const pending = run(controller.signal);
    controller.abort();
    expect(
      toPipelineFailure(await pending.catch((cause: unknown) => cause)),
    ).toEqual({ kind: 'cancelled' });
    expect(workers.singles[0].terminated).toBe(true);
  });

  it('ends the worker when it fails outright', async () => {
    const { workers, run } = setup(true);
    const pending = run();
    workers.singles[0].emitError('The worker failed to start.');
    await expect(pending).rejects.toThrow('The worker failed to start.');
    expect(workers.singles[0].terminated).toBe(true);
  });
});
