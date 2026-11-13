import { describe, expect, it, vi } from 'vitest';

import { SHARP_KERNEL } from '../vision/warp/warp';
import { PipelineError } from './failure';
import {
  createFakeFactory,
  rgba,
  type FakeHandler,
} from './fakeWorkers.test-support';
import { runPipeline } from './runPipeline';

const WORKING = { width: 8, height: 6 };
const FEATURES = {
  width: 8,
  height: 6,
  keypoints: [],
  descriptors: new Uint32Array(0),
};
const LEARNED = { assetBase: 'https://example.test/ml' } as const;

/** An align worker: 'skip' frames are skipped by the corner-based alignment; the learned one aligns 'rescue' and skips the rest. */
function alignHandler(options: { crashLearning?: boolean } = {}): FakeHandler {
  return async (request) => {
    const { id } = request;
    if (request.type === 'decode-reference') {
      const image = rgba(WORKING.width, WORKING.height, 9);
      return {
        response: {
          type: 'reference-decoded',
          id,
          image,
          source: { width: 80, height: 60 },
          alignWorkers: 1,
          stripRows: WORKING.height,
          passes: 1,
          features: FEATURES,
          sharpness: 0.4,
        },
        transfer: [image.data.buffer],
      };
    }
    if (request.type === 'set-reference')
      return { response: { type: 'reference-set', id }, transfer: [] };
    if (request.type === 'learned-reference') {
      if (options.crashLearning) throw new Error('the weights did not load');
      return { response: { type: 'learned-reference-set', id }, transfer: [] };
    }
    const verdict = await (request.file as Blob).text();
    const learned = request.type === 'align-learned';
    if (
      verdict === 'skip' ||
      (verdict === 'hopeless' && !learned) ||
      (learned && verdict === 'hopeless')
    )
      return {
        response: { type: 'skipped', id, matches: 12, inliers: 3 },
        transfer: [],
      };
    if (verdict === 'rescue' && !learned)
      return {
        response: { type: 'skipped', id, matches: 12, inliers: 3 },
        transfer: [],
      };
    const image = rgba(WORKING.width, WORKING.height, 1);
    return {
      response: {
        type: 'aligned',
        id,
        frame: { image, coverage: new Uint8Array(48).fill(1) },
        homography: Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
        matches: learned ? 60 : 120,
        inliers: learned ? 40 : 90,
        sharpness: 0.4,
        kernel: SHARP_KERNEL,
      },
      transfer: [image.data.buffer],
    };
  };
}

const stack: FakeHandler = (request) => {
  const { id } = request;
  if (request.type === 'crop')
    return {
      response: {
        type: 'cropped',
        id,
        ...WORKING,
        rect: { x: 1, y: 1, width: 6, height: 4 },
        frameCount: 3,
      },
      transfer: [],
    };
  if (request.type === 'stack-rows')
    return { response: { type: 'stacked', id }, transfer: [] };
  return { response: { type: 'added', id }, transfer: [] };
};

const files = (...verdicts: string[]) =>
  verdicts.map((verdict) =>
    Object.assign(new Blob([verdict]), { name: `${verdict}.jpg` }),
  );

function start(
  verdicts: string[],
  options: Record<string, unknown>,
  handler = alignHandler(),
  signal?: AbortSignal,
) {
  const workers = createFakeFactory(handler, stack);
  const blobs = files(...verdicts);
  const result = runPipeline({
    files: blobs,
    reference: 1,
    names: blobs.map((blob) => blob.name),
    options: { quality: 'low', poolSize: 1, ...options },
    onProgress: () => {},
    workers,
    signal,
  });
  return { workers, result };
}

const sentTypes = (port: { sent: { type: string }[] }) =>
  port.sent.map((message) => message.type);

describe('runPipeline, learned alignment', () => {
  it('gives a frame the corner-based alignment skipped a second try with learned keypoints', async () => {
    const { workers, result } = start(['rescue', 'ok', 'ok'], {
      learned: LEARNED,
    });
    const exposure = await result;
    const sent = sentTypes(workers.aligners[0]);
    expect(sent.filter((type) => type === 'learned-reference')).toHaveLength(1);
    expect(sent.filter((type) => type === 'align-learned')).toHaveLength(1);
    expect(exposure.frames[0]).toMatchObject({
      status: 'aligned',
      matches: 60,
      inliers: 40,
    });
    expect(exposure.alignedCount).toBe(3);
  });

  it('prepares the learned reference from the reference photo, at the working size, from the asked folder', async () => {
    const { workers, result } = start(['rescue', 'ok', 'ok'], {
      learned: LEARNED,
    });
    await result;
    const prepare = workers.aligners[0].sent.find(
      (message) => message.type === 'learned-reference',
    );
    expect(prepare).toMatchObject({
      target: WORKING,
      assetBase: LEARNED.assetBase,
    });
    expect(await (prepare?.file as Blob).text()).toBe('ok');
  });

  it('hands the rescued frame to the stack worker like any other', async () => {
    const { workers, result } = start(['rescue', 'ok', 'ok'], {
      learned: LEARNED,
    });
    await result;
    const added = workers.stacks[0].sent
      .filter((message) => message.type === 'add-frame')
      .map((message) => message.index);
    expect(added.sort()).toEqual([0, 2]);
  });

  it('leaves a frame skipped that the learned alignment cannot align either', async () => {
    const { result } = start(['hopeless', 'ok', 'ok'], { learned: LEARNED });
    const exposure = await result;
    expect(exposure.frames[0]).toMatchObject({
      status: 'skipped',
      matches: 12,
      inliers: 3,
    });
    expect(exposure.alignedCount).toBe(2);
  });

  it('asks for nothing when every frame aligned', async () => {
    const { workers, result } = start(['ok', 'ok', 'ok'], { learned: LEARNED });
    await result;
    expect(sentTypes(workers.aligners[0])).not.toContain('learned-reference');
  });

  it('asks for nothing when the option is not set', async () => {
    const { workers, result } = start(['rescue', 'ok', 'ok'], {});
    const exposure = await result;
    expect(sentTypes(workers.aligners[0])).not.toContain('learned-reference');
    expect(exposure.frames[0].status).toBe('skipped');
  });

  it('leaves the frames skipped, and finishes, when the second try cannot even start', async () => {
    const { result } = start(
      ['rescue', 'ok', 'ok'],
      { learned: LEARNED },
      alignHandler({ crashLearning: true }),
    );
    const exposure = await result;
    expect(exposure.frames[0].status).toBe('skipped');
    expect(exposure.alignedCount).toBe(2);
  });

  it('leaves the frames skipped, and tries none of them, when the reference cannot be read for the second try', async () => {
    const unreadableReference: FakeHandler = (request, post) =>
      request.type === 'learned-reference'
        ? {
            response: { type: 'unreadable', id: request.id },
            transfer: [],
          }
        : alignHandler()(request, post);
    const { workers, result } = start(
      ['rescue', 'ok', 'ok'],
      { learned: LEARNED },
      unreadableReference,
    );
    const exposure = await result;
    expect(sentTypes(workers.aligners[0])).not.toContain('align-learned');
    expect(exposure.frames[0].status).toBe('skipped');
  });

  it('ends a run cancelled during the second try as cancelled, even with too few frames aligned without it', async () => {
    const controller = new AbortController();
    const stalled: FakeHandler = (request, post) =>
      request.type === 'learned-reference'
        ? new Promise<void>(() => {})
        : alignHandler()(request, post);
    const { workers, result } = start(
      ['rescue', 'ok', 'skip'],
      { learned: LEARNED },
      stalled,
      controller.signal,
    );
    const outcome = result.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await vi.waitFor(() =>
      expect(sentTypes(workers.aligners[0])).toContain('learned-reference'),
    );
    controller.abort();
    const error = await outcome;
    expect(error).toBeInstanceOf(PipelineError);
    expect((error as PipelineError).failure).toEqual({ kind: 'cancelled' });
  });

  it('ends a cancelled run as cancelled, not as a frame skipped', async () => {
    const controller = new AbortController();
    const stalled: FakeHandler = (request, post) =>
      request.type === 'learned-reference'
        ? new Promise<void>(() => {})
        : alignHandler()(request, post);
    const { workers, result } = start(
      ['rescue', 'ok', 'ok'],
      { learned: LEARNED },
      stalled,
      controller.signal,
    );
    const outcome = result.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sentTypes(workers.aligners[0])).toContain('learned-reference');
    controller.abort();
    const error = await outcome;
    expect(
      error instanceof PipelineError && error.failure.kind === 'cancelled',
    ).toBe(true);
  });
});
