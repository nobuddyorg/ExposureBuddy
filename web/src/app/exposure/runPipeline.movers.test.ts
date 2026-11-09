import { describe, expect, it } from 'vitest';

import type { WorkerMessage } from '../vision/pipeline/protocol';
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
const MOVERS = {
  assetBase: 'https://example.test/ml',
  detail: 'fast',
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

  describe('with the blur', () => {
    const BLUR = {
      effect: 'motion',
      strength: 0.5,
      angle: 0,
      grow: 0,
    } as const;
    const blurredImage = rgba(8, 6, 3);
    const withBlur: FakeHandler = (request, post) => {
      const served = single(request, post) as {
        response: WorkerMessage;
        transfer: ArrayBuffer[];
      };
      return {
        response: {
          ...served.response,
          blurred: blurredImage,
        } as WorkerMessage,
        transfer: [],
      };
    };

    it('passes the effect to the single-photo worker', async () => {
      const { workers, result } = start(
        { movers: { ...MOVERS, blur: BLUR } },
        withBlur,
      );
      await result;
      expect(workers.singles[0].sent[0]).toMatchObject({ blur: BLUR });
    });

    it("puts the blurred frames' mean in place of the stack's own after the last strip", async () => {
      const { workers, result } = start(
        { movers: { ...MOVERS, blur: BLUR } },
        withBlur,
      );
      await result;
      const sent = workers.stacks[0].sent;
      const mean = sent.findIndex((request) => request.type === 'set-mean');
      expect(mean).toBeGreaterThan(
        sent.findLastIndex((request) => request.type === 'stack-rows'),
      );
      expect(sent[mean].image).toBe(blurredImage);
    });

    it('sends no set-mean and no effect when only the background is cleaned', async () => {
      const { workers, result } = start({ movers: MOVERS });
      await result;
      expect(workers.singles[0].sent[0]).not.toHaveProperty('blur');
      expect(
        workers.stacks[0].sent.some((request) => request.type === 'set-mean'),
      ).toBe(false);
    });
  });
});
