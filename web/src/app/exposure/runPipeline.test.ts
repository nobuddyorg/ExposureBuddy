import { describe, expect, it, vi } from 'vitest';

import type { WorkerMessage } from '../vision/pipeline/protocol';
import { NO_OVERLAP_MESSAGE } from '../vision/pipeline/stackSession';
import { PipelineError } from './failure';
import {
  createFakeFactory,
  rgba,
  type FakeHandler,
} from './fakeWorkers.test-support';
import {
  countAligned,
  referenceIndex,
  runPipeline,
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

function run(
  verdicts: string[],
  overrides: Partial<Parameters<typeof runPipeline>[0]> = {},
) {
  const factory = createFakeFactory(alignHandler(), stackHandler());
  const progress: PipelineProgress[] = [];
  const files = verdicts.map((verdict) => file(verdict));
  const result = runPipeline({
    files,
    names: files.map((each) => each.name),
    options: { quality: 'low', poolSize: 2 },
    workers: factory,
    onProgress: (update) => progress.push(update),
    ...overrides,
  });
  return { factory, progress, result };
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
    expect(stages[0]).toBe('reference:0/1');
    expect(stages).toContain('aligning:0/4');
    expect(stages).toContain('aligning:4/4');
    expect(stages).toContain('stacking:50/100');
    expect(stages.at(-1)).toBe('compositing:0/1');
    expect(progress.at(-1)?.frames[2].status).toBe('reference');

    const rendered = await exposure.render({
      ghostStrength: 1,
      ghostBlur: 0,
      glow: 0,
    });
    expect(rendered.data[0]).toBe(5);
    expect(stack.sent.at(-1)).toMatchObject({
      type: 'render',
      params: { ghostStrength: 1 },
    });
    const reference = await exposure.renderReference();
    expect(reference.data[0]).toBe(7);
    exposure.dispose();
    expect(stack.terminated).toBe(true);
  });

  it('never opens more aligners than there are frames to align', async () => {
    const { factory, result } = run(['ok', 'ok'], {
      options: { quality: 'low', poolSize: 4 },
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
    const align = alignHandler();
    // Alignment never answers, so the run is guaranteed to still be in flight when the abort lands.
    const factory = createFakeFactory(
      (request, post) =>
        request.type === 'align'
          ? new Promise<void>(() => {})
          : align(request, post),
      stackHandler(),
    );
    const result = runPipeline({
      files: [file('ok'), file('ok'), file('ok')],
      names: ['a', 'b', 'c'],
      options: { quality: 'low', poolSize: 2 },
      workers: factory,
      onProgress: () => {},
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(
        factory.aligners
          .flatMap((port) => port.sent)
          .filter((m) => m.type === 'align'),
      ).toHaveLength(2),
    );
    controller.abort();
    await expect(result).rejects.toMatchObject({
      failure: { kind: 'cancelled' },
    });
    expect(factory.aligners.every((port) => port.terminated)).toBe(true);
    expect(factory.stacks[0].terminated).toBe(true);
  });

  it('reports a burst with no common area as its own failure', async () => {
    const stack = stackHandler();
    const factory = createFakeFactory(alignHandler(), (request, post) => {
      if (request.type === 'stack') throw new Error(NO_OVERLAP_MESSAGE);
      return stack(request, post);
    });
    await expect(
      runPipeline({
        files: [file('ok'), file('ok')],
        names: ['a', 'b'],
        options: { quality: 'low', poolSize: 1 },
        workers: factory,
        onProgress: () => {},
      }),
    ).rejects.toMatchObject({ failure: { kind: 'no_overlap' } });
  });

  it('treats an unexpected reference response as a failure', async () => {
    const factory = createFakeFactory(
      (request) => ({
        response: { type: 'reference-set', id: request.id },
        transfer: [],
      }),
      stackHandler(),
    );
    await expect(
      runPipeline({
        files: [file('ok'), file('ok')],
        names: ['a', 'b'],
        options: { quality: 'low', poolSize: 1 },
        workers: factory,
        onProgress: () => {},
      }),
    ).rejects.toMatchObject({
      failure: { kind: 'unknown', message: /reference-set/ },
    });
  });

  it('treats an unexpected align response as a failure', async () => {
    const align = alignHandler();
    const factory = createFakeFactory(
      (request, post) =>
        request.type === 'align'
          ? {
              response: { type: 'reference-set', id: request.id },
              transfer: [],
            }
          : align(request, post),
      stackHandler(),
    );
    await expect(
      runPipeline({
        files: [file('ok'), file('ok')],
        names: ['a', 'b'],
        options: { quality: 'low', poolSize: 1 },
        workers: factory,
        onProgress: () => {},
      }),
    ).rejects.toMatchObject({
      failure: { kind: 'unknown', message: /reference-set/ },
    });
  });
});
