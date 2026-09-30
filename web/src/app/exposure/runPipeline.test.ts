import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_BUDGET_BYTES } from '../vision/pipeline/budget';
import type {
  Served,
  WorkerMessage,
  WorkingSizing,
} from '../vision/pipeline/protocol';
import { NO_OVERLAP_MESSAGE } from '../vision/pipeline/protocol';
import { PipelineError } from './failure';
import {
  createFakeFactory,
  rgba,
  type FakeFactory,
  type FakeHandler,
} from './fakeWorkers.test-support';
import {
  countAligned,
  referenceIndex,
  runPipeline,
  type PipelineInput,
  type PipelineProgress,
} from './runPipeline';

const WORKING = { width: 8, height: 6 };
const FEATURES = {
  width: 8,
  height: 6,
  keypoints: [],
  descriptors: new Uint32Array(0),
};

/** An align worker that reads the file's text as its verdict: 'skip', 'bad', 'crash', or anything else for aligned. */
function alignHandler(): FakeHandler {
  return async (request) => {
    const { id } = request;
    if (request.type === 'decode-reference') {
      const verdict = await (request.file as Blob).text();
      if (verdict === 'bad')
        return { response: { type: 'unreadable', id }, transfer: [] };
      const image = rgba(WORKING.width, WORKING.height, 9);
      return {
        response: {
          type: 'reference-decoded',
          id,
          image,
          source: { width: 80, height: 60 },
          // The fake has memory to spare: every worker the device could run fits.
          alignWorkers: (request.sizing as WorkingSizing).requestedWorkers,
          features: FEATURES,
        },
        transfer: [image.data.buffer],
      };
    }
    if (request.type === 'set-reference')
      return { response: { type: 'reference-set', id }, transfer: [] };
    const verdict = await (request.file as Blob).text();
    if (verdict === 'bad')
      return { response: { type: 'unreadable', id }, transfer: [] };
    if (verdict === 'skip')
      return {
        response: { type: 'skipped', id, matches: 30, inliers: 4 },
        transfer: [],
      };
    if (verdict === 'crash') throw new Error('kernel exploded');
    const image = rgba(WORKING.width, WORKING.height, 1);
    return {
      response: {
        type: 'aligned',
        id,
        frame: { image, coverage: new Uint8Array(48).fill(1) },
        matches: 120,
        inliers: 90,
      },
      transfer: [image.data.buffer],
    };
  };
}

/** An align worker that never answers `type`, so a run is guaranteed to still be waiting on it when an abort lands. */
function alignHandlerStalledOn(type: string): FakeHandler {
  const align = alignHandler();
  return (request, post) =>
    request.type === type ? new Promise<void>(() => {}) : align(request, post);
}

function stackHandler(): FakeHandler {
  return (request, post) => {
    const { id } = request;
    switch (request.type) {
      case 'stack':
        post({ type: 'stack-progress', id, fraction: 0.5 } as WorkerMessage);
        return {
          response: {
            type: 'stacked',
            id,
            ...WORKING,
            rect: { x: 1, y: 1, width: 6, height: 4 },
            frameCount: 3,
          },
          transfer: [],
        };
      case 'render':
      case 'render-reference':
        return {
          response: {
            type: 'rendered',
            id,
            image: rgba(6, 4, request.type === 'render' ? 5 : 7),
          },
          transfer: [],
        };
      default:
        return { response: { type: 'added', id }, transfer: [] };
    }
  };
}

const file = (verdict: string, name = `${verdict}.jpg`) =>
  Object.assign(new Blob([verdict], { type: 'image/jpeg' }), { name });

type RunOverrides = Partial<Omit<PipelineInput, 'workers'>> & {
  readonly workers?: FakeFactory;
};

function run(verdicts: string[], overrides: RunOverrides = {}) {
  const factory =
    overrides.workers ?? createFakeFactory(alignHandler(), stackHandler());
  const progress: PipelineProgress[] = [];
  const files = verdicts.map((verdict) => file(verdict));
  const result = runPipeline({
    files,
    names: files.map((each) => each.name),
    options: { quality: 'low', poolSize: 2 },
    onProgress: (update) => progress.push(update),
    ...overrides,
    workers: factory,
  });
  return { factory, progress, result };
}

/** Every request the run posted, across all of its workers. */
function everyRequest(factory: FakeFactory) {
  return [...factory.aligners, ...factory.stacks].flatMap((port) => port.sent);
}

/** How `result` settled by the next macrotask: its failure kind, 'resolved', or 'pending' when a cancelled step hangs. */
function outcomeOf(result: Promise<unknown>): Promise<string> {
  return Promise.race([
    result.then(
      () => 'resolved',
      (error: unknown) =>
        error instanceof PipelineError ? error.failure.kind : String(error),
    ),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve('pending'));
    }),
  ]);
}

describe('referenceIndex', () => {
  it('picks the middle frame, the earlier one for an even count', () => {
    expect(referenceIndex(2)).toBe(0);
    expect(referenceIndex(3)).toBe(1);
    expect(referenceIndex(12)).toBe(5);
  });
});

describe('countAligned', () => {
  it('counts the reference and the aligned frames only', () => {
    expect(
      countAligned([
        { index: 0, status: 'reference', matches: 0, inliers: 0 },
        { index: 1, status: 'aligned', matches: 1, inliers: 1 },
        { index: 2, status: 'skipped', matches: 1, inliers: 0 },
        { index: 3, status: 'unreadable', matches: 0, inliers: 0 },
        { index: 4, status: 'pending', matches: 0, inliers: 0 },
      ]),
    ).toBe(2);
  });
});

describe('runPipeline', () => {
  it('aligns every frame to the middle one, stacks, and renders through the stack worker', async () => {
    const { factory, progress, result } = run([
      'ok',
      'ok',
      'ok',
      'skip',
      'bad',
    ]);
    const exposure = await result;

    expect(exposure.frames.map((frame) => frame.status)).toEqual([
      'aligned',
      'aligned',
      'reference',
      'skipped',
      'unreadable',
    ]);
    expect(exposure.frames[3]).toMatchObject({ matches: 30, inliers: 4 });
    expect(exposure).toMatchObject({
      width: 6,
      height: 4,
      alignedCount: 3,
      totalCount: 5,
    });

    const [stack] = factory.stacks;
    const types = stack.sent.map((message) => message.type);
    expect(types).toEqual(['add-reference', 'add-frame', 'add-frame', 'stack']);
    // Pixel buffers travel as transferables, never as copies.
    expect(stack.transfers[0]).toHaveLength(1);
    expect(stack.transfers[1]).toHaveLength(2);
    expect(stack.transfers[3]).toHaveLength(0);
    // Two aligners for four frames; the reference goes to the first, features to both.
    expect(factory.aligners).toHaveLength(2);
    expect(factory.aligners[0].sent[0].type).toBe('decode-reference');
    expect(
      factory.aligners.map(
        (port) => port.sent.filter((m) => m.type === 'set-reference').length,
      ),
    ).toEqual([1, 1]);
    expect(factory.aligners.every((port) => port.terminated)).toBe(true);
    expect(stack.terminated).toBe(false);

    const stages = progress.map(
      (update) => `${update.stage}:${update.done}/${update.total}`,
    );
    expect(stages).toEqual([
      'reference:0/1',
      'aligning:0/4',
      'aligning:1/4',
      'aligning:2/4',
      'aligning:3/4',
      'aligning:4/4',
      'stacking:0/100',
      'stacking:50/100',
      'compositing:0/1',
    ]);
    expect(progress[0].frames.map((frame) => frame.status)).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(progress.at(-1)?.frames[2].status).toBe('reference');

    const rendered = await exposure.render({
      background: 'median',
      ghostStrength: 1,
      ghostBlur: 0,
      glow: 0,
    });
    expect(rendered.data[0]).toBe(5);
    expect(stack.sent.at(-1)).toMatchObject({
      type: 'render',
      params: { background: 'median', ghostStrength: 1 },
    });
    const reference = await exposure.renderReference();
    expect(reference.data[0]).toBe(7);
    exposure.dispose();
    expect(stack.terminated).toBe(true);
  });

  it('sizes the reference decode from the burst length, the quality and the given budget', async () => {
    const budgetBytes = 64 * 1024 * 1024;
    const { factory, result } = run(['ok', 'ok', 'ok'], {
      options: { quality: 'standard', poolSize: 2, budgetBytes },
    });
    await result;
    expect(factory.aligners[0].sent[0]).toMatchObject({
      type: 'decode-reference',
      sizing: {
        frameCount: 3,
        budgetBytes,
        maxLongEdge: 1600,
        requestedWorkers: 2,
      },
    });
  });

  it('decodes the reference within the default budget when none is given', async () => {
    const { factory, result } = run(['ok', 'ok']);
    await result;
    expect(factory.aligners[0].sent[0]).toMatchObject({
      sizing: {
        frameCount: 2,
        budgetBytes: DEFAULT_BUDGET_BYTES,
        maxLongEdge: 1024,
        requestedWorkers: 2,
      },
    });
  });

  it('aligns every frame onto the working size of the decoded reference', async () => {
    const { factory, result } = run(['ok', 'ok', 'ok']);
    await result;
    const aligns = everyRequest(factory).filter(
      (message) => message.type === 'align',
    );
    expect(aligns).toHaveLength(2);
    expect(aligns.map((message) => message.target)).toEqual([WORKING, WORKING]);
  });

  it('gives every request across all workers its own id, numbered from 1', async () => {
    const { factory, result } = run(['ok', 'ok', 'ok', 'skip']);
    await result;
    const ids = everyRequest(factory)
      .map((message) => message.id)
      .sort((a, b) => a - b);
    expect(ids).toEqual(ids.map((_, position) => position + 1));
  });

  it('never opens more aligners than there are frames to align', async () => {
    const { factory, result } = run(['ok', 'ok'], {
      options: { quality: 'low', poolSize: 4 },
    });
    await result;
    expect(factory.aligners).toHaveLength(1);
  });

  it('opens as many aligners as the device could run when the budget allows them', async () => {
    const { factory, result } = run(['ok', 'ok', 'ok', 'ok', 'ok'], {
      options: { quality: 'low', poolSize: 3 },
    });
    await result;
    expect(factory.aligners).toHaveLength(3);
    // Only the first decoded the reference; every one of them got its features.
    expect(
      factory.aligners.map(
        (port) => port.sent.map((message) => message.type)[0],
      ),
    ).toEqual(['decode-reference', 'set-reference', 'set-reference']);
  });

  it('opens only as many aligners as the reference decode planned for', async () => {
    const align = alignHandler();
    const frugal: FakeHandler = async (request, post) => {
      const served = (await align(request, post)) as Served<WorkerMessage>;
      if (request.type !== 'decode-reference') return served;
      const response = { ...served.response, alignWorkers: 1 };
      return { response, transfer: served.transfer };
    };
    const { factory, result } = run(['ok', 'ok', 'ok', 'ok', 'ok'], {
      options: { quality: 'low', poolSize: 4 },
      workers: createFakeFactory(frugal, stackHandler()),
    });
    await result;
    expect(factory.aligners).toHaveLength(1);
  });

  it('refuses fewer than two photos before touching a worker', async () => {
    const { factory, result } = run(['ok']);
    await expect(result).rejects.toMatchObject({
      failure: { kind: 'too_few_aligned', count: 1 },
    });
    expect(factory.aligners).toHaveLength(0);
  });

  it('fails with too_few_aligned when only the reference survives, and stops every worker', async () => {
    const { factory, result } = run(['skip', 'bad', 'ok', 'skip', 'bad']);
    await expect(result).rejects.toMatchObject({
      failure: { kind: 'too_few_aligned', count: 1 },
    });
    expect(factory.aligners.every((port) => port.terminated)).toBe(true);
    expect(factory.stacks[0].terminated).toBe(true);
  });

  it('names the reference file when it cannot be decoded', async () => {
    const files = [
      file('ok', 'a.jpg'),
      file('bad', 'IMG_0042.HEIC'),
      file('ok', 'c.jpg'),
    ];
    const { result } = run([], {
      files,
      names: files.map((each) => each.name),
    });
    await expect(result).rejects.toMatchObject({
      failure: { kind: 'decode_failed', name: 'IMG_0042.HEIC' },
    });
  });

  it('wraps a worker error as an unknown failure', async () => {
    const { result } = run(['crash', 'ok', 'ok']);
    await expect(result).rejects.toBeInstanceOf(PipelineError);
    await expect(result).rejects.toMatchObject({
      failure: { kind: 'unknown', message: 'kernel exploded' },
    });
  });

  it('rejects with the abort and terminates the workers when cancelled mid-way', async () => {
    const controller = new AbortController();
    const { factory, result } = run(['ok', 'ok', 'ok'], {
      workers: createFakeFactory(
        alignHandlerStalledOn('align'),
        stackHandler(),
      ),
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(
        everyRequest(factory).filter((m) => m.type === 'align'),
      ).toHaveLength(2),
    );
    controller.abort();
    await expect(result).rejects.toMatchObject({
      failure: { kind: 'cancelled' },
    });
    expect(factory.aligners.every((port) => port.terminated)).toBe(true);
    expect(factory.stacks[0].terminated).toBe(true);
  });

  it('cancels promptly when the abort lands while the reference is still decoding', async () => {
    const controller = new AbortController();
    const { factory, result } = run(['ok', 'ok'], {
      workers: createFakeFactory(
        alignHandlerStalledOn('decode-reference'),
        stackHandler(),
      ),
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(factory.aligners[0].sent.map((m) => m.type)).toEqual([
        'decode-reference',
      ]),
    );
    controller.abort();
    expect(await outcomeOf(result)).toBe('cancelled');
    expect(factory.aligners[0].terminated).toBe(true);
  });

  it('cancels promptly when the abort lands while the aligners are taking the reference', async () => {
    const controller = new AbortController();
    const { factory, result } = run(['ok', 'ok', 'ok'], {
      workers: createFakeFactory(
        alignHandlerStalledOn('set-reference'),
        stackHandler(),
      ),
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(
        everyRequest(factory).filter((m) => m.type === 'set-reference'),
      ).toHaveLength(2),
    );
    controller.abort();
    expect(await outcomeOf(result)).toBe('cancelled');
  });

  it('stops the stack worker when the signal aborts after the result is ready', async () => {
    const controller = new AbortController();
    const { factory, result } = run(['ok', 'ok'], {
      signal: controller.signal,
    });
    await result;
    const [stack] = factory.stacks;
    expect(stack.terminated).toBe(false);
    controller.abort();
    expect(stack.terminated).toBe(true);
  });

  it('lets go of the signal on dispose, so a later abort no longer touches the workers', async () => {
    const controller = new AbortController();
    const { factory, result } = run(['ok', 'ok'], {
      signal: controller.signal,
    });
    const exposure = await result;
    exposure.dispose();
    controller.abort();
    expect(factory.stacks[0].terminations).toBe(1);
    expect(factory.aligners.map((port) => port.terminations)).toEqual([1]);
  });

  it('reports a burst with no common area as its own failure', async () => {
    const stack = stackHandler();
    const { result } = run(['ok', 'ok'], {
      workers: createFakeFactory(alignHandler(), (request, post) => {
        if (request.type === 'stack') throw new Error(NO_OVERLAP_MESSAGE);
        return stack(request, post);
      }),
    });
    await expect(result).rejects.toMatchObject({
      failure: { kind: 'no_overlap' },
    });
  });

  it('treats an unexpected reference response as a failure naming it', async () => {
    const { result } = run(['ok', 'ok'], {
      workers: createFakeFactory(
        (request) => ({
          response: { type: 'reference-set', id: request.id },
          transfer: [],
        }),
        stackHandler(),
      ),
    });
    await expect(result).rejects.toMatchObject({
      failure: {
        kind: 'unknown',
        message: 'Unexpected reference-set while decoding the reference.',
      },
    });
  });

  it('treats an unexpected align response as a failure naming it', async () => {
    const align = alignHandler();
    const { result } = run(['ok', 'ok'], {
      workers: createFakeFactory(
        (request, post) =>
          request.type === 'align'
            ? {
                response: { type: 'reference-set', id: request.id },
                transfer: [],
              }
            : align(request, post),
        stackHandler(),
      ),
    });
    await expect(result).rejects.toMatchObject({
      failure: {
        kind: 'unknown',
        message: 'Unexpected reference-set while aligning.',
      },
    });
  });
});
