import { describe, expect, it, vi } from 'vitest';

import { emptySmearSum } from '../vision/effects/smear';
import {
  transferablesOf,
  type WorkerMessage,
} from '../vision/pipeline/protocol';
import { PipelineError } from './failure';
import {
  createFakeFactory,
  rgba,
  type FakeHandler,
} from './fakeWorkers.test-support';
import { runPipeline, type PipelineProgress } from './runPipeline';

const WORKING = { width: 8, height: 6 };
const HOMOGRAPHY = Float64Array.from([1, 0, 0.5, 0, 1, 0, 0, 0, 1]);
const FEATURES = {
  width: 8,
  height: 6,
  keypoints: [],
  descriptors: new Uint32Array(0),
};
const TRAIL = { standingBlur: 0.02 };
const MOVERS = {
  assetBase: 'https://example.test/ml',
  detail: 'fast',
  trail: TRAIL,
} as const;

const align: FakeHandler = async (request) => {
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
  const image = rgba(WORKING.width, WORKING.height, 1);
  return {
    response: {
      type: 'aligned',
      id,
      frame: { image, coverage: new Uint8Array(48).fill(1) },
      homography: HOMOGRAPHY,
      matches: 120,
      inliers: 90,
      sharpness: 0.4,
    },
    transfer: [image.data.buffer],
  };
};

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

/** A single-photo worker that finds a mask per item and reports every photo as it goes. */
const single: FakeHandler = (request, post) => {
  const { id } = request;
  const items = request.items as unknown[];
  items.forEach((_, index) =>
    post({
      type: 'movers-progress',
      id,
      done: index,
      total: items.length,
    } as WorkerMessage),
  );
  const masks = items.map(() => ({
    width: 2,
    height: 2,
    data: new Uint8Array(4).fill(255),
  }));
  return {
    response: { type: 'movers-masked', id, masks } as WorkerMessage,
    transfer: [],
  };
};

const files = ['a', 'b', 'c'].map((name) =>
  Object.assign(new Blob([name]), { name }),
);

function start(
  options: Record<string, unknown>,
  handler: FakeHandler = single,
) {
  const workers = createFakeFactory(align, stack, handler);
  const progress: PipelineProgress[] = [];
  const result = runPipeline({
    files,
    reference: 1,
    names: files.map((each) => each.name),
    options: { quality: 'low', poolSize: 1, ...options },
    onProgress: (update) => progress.push(update),
    workers,
  });
  return { workers, progress, result };
}

describe('runPipeline with movers', () => {
  it('asks the single-photo worker once, for the reference and every aligned frame with its transform', async () => {
    const { workers, result } = start({ movers: MOVERS });
    await result;
    expect(workers.singles).toHaveLength(1);
    const [asked] = workers.singles[0].sent;
    expect(asked).toMatchObject({
      type: 'movers-masks',
      working: WORKING,
      assetBase: MOVERS.assetBase,
      detail: 'fast',
    });
    const items = asked.items as { file: Blob; homography: Float64Array }[];
    expect(items.map((item) => item.file)).toEqual([
      files[1],
      files[0],
      files[2],
    ]);
    expect([...items[0].homography]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect([...items[1].homography]).toEqual([...HOMOGRAPHY]);
  });

  it('gives every mask to the stack worker under its frame, before the crop', async () => {
    const { workers, result } = start({ movers: MOVERS });
    await result;
    const sent = workers.stacks[0].sent;
    const masks = sent.filter((request) => request.type === 'add-mask');
    expect(masks.map((request) => request.index)).toEqual(['reference', 0, 2]);
    expect(
      sent.findIndex((request) => request.type === 'crop'),
    ).toBeGreaterThan(
      sent.findLastIndex((request) => request.type === 'add-mask'),
    );
  });

  it('moves every mask to the stack worker instead of copying it', async () => {
    const { workers, result } = start({ movers: MOVERS });
    await result;
    const stack = workers.stacks[0];
    const masks = stack.sent.flatMap((request, position) =>
      request.type === 'add-mask' ? [position] : [],
    );
    expect(masks).toHaveLength(3);
    for (const position of masks) {
      const { mask } = stack.sent[position] as unknown as {
        mask: { data: Uint8Array };
      };
      expect(stack.transfers[position]).toEqual([mask.data.buffer]);
    }
  });

  it('reports the photos searched as the movers stage', async () => {
    const { progress, result } = start({ movers: MOVERS });
    await result;
    const stages = progress.filter((update) => update.stage === 'movers');
    expect(stages.map((update) => [update.done, update.total])).toEqual([
      [0, 3],
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });

  it('lets the single-photo worker go once it is done', async () => {
    const { workers, result } = start({ movers: MOVERS });
    await result;
    expect(workers.singles[0].terminations).toBeGreaterThan(0);
  });

  it('starts no single-photo worker when movers are not asked for', async () => {
    const { workers, result } = start({});
    await result;
    expect(workers.singles).toHaveLength(0);
    expect(
      workers.stacks[0].sent.some((request) => request.type === 'add-mask'),
    ).toBe(false);
  });

  it('lets the single-photo worker go when the run is cancelled while it searches', async () => {
    const controller = new AbortController();
    const stalled: FakeHandler = () => new Promise<void>(() => {});
    const workers = createFakeFactory(align, stack, stalled);
    const result = runPipeline({
      files,
      reference: 1,
      names: files.map((each) => each.name),
      options: { quality: 'low', poolSize: 1, movers: MOVERS },
      onProgress: () => {},
      workers,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(workers.singles).toHaveLength(1));
    await vi.waitFor(() => expect(workers.singles[0].sent).toHaveLength(1));
    controller.abort();
    await expect(result).rejects.toSatisfy(
      (error) =>
        error instanceof PipelineError && error.failure.kind === 'cancelled',
    );
    expect(workers.singles[0].terminations).toBeGreaterThan(0);
  });

  it('fails with the cause when the browser cannot run the detection', async () => {
    const { result } = start({ movers: MOVERS }, () => {
      throw new Error(
        'This browser has no WebGL inside a Web Worker, which the people detection needs.',
      );
    });
    await expect(result).rejects.toSatisfy(
      (error) =>
        error instanceof PipelineError &&
        error.failure.kind === 'detection_unsupported',
    );
  });

  describe('with the trails', () => {
    const trailSum = emptySmearSum({ width: 8, height: 6 });
    const withTrail: FakeHandler = (request, post) => {
      const served = single(request, post) as {
        response: WorkerMessage;
        transfer: ArrayBuffer[];
      };
      return {
        response: {
          ...served.response,
          trail: { sum: trailSum, frames: 3 },
        } as WorkerMessage,
        transfer: [],
      };
    };

    it('passes the trail settings to the single-photo worker', async () => {
      const { workers, result } = start({ movers: MOVERS }, withTrail);
      await result;
      expect(workers.singles[0].sent[0]).toMatchObject({ trail: TRAIL });
    });

    it('hands the smeared movers to the stack after the last strip', async () => {
      const { workers, result } = start({ movers: MOVERS }, withTrail);
      await result;
      const sent = workers.stacks[0].sent;
      const set = sent.findIndex((request) => request.type === 'set-trail');
      expect(set).toBeGreaterThan(
        sent.findLastIndex((request) => request.type === 'stack-rows'),
      );
      expect(sent[set]).toMatchObject({ sum: trailSum, frames: 3 });
    });

    it('moves the smeared movers to the stack instead of copying them', async () => {
      const { workers, result } = start({ movers: MOVERS }, withTrail);
      await result;
      const stack = workers.stacks[0];
      const set = stack.sent.findIndex(
        (request) => request.type === 'set-trail',
      );
      expect(stack.transfers[set]).toEqual(transferablesOf(trailSum));
      expect(stack.transfers[set].length).toBeGreaterThan(0);
    });

    it('tells the result its movers are drawn as trails, and only then', async () => {
      const trailed = start({ movers: MOVERS }, withTrail);
      expect((await trailed.result).trailedMovers).toBe(true);
      expect((await start({ movers: MOVERS }).result).trailedMovers).toBe(
        false,
      );
      expect((await start({}).result).trailedMovers).toBe(false);
    });
  });
});
