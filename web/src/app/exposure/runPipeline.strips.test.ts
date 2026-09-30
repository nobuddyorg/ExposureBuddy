import { describe, expect, it } from 'vitest';

import {
  shiftGray,
  texturedScene,
} from '../vision/features/synthetic.test-support';
import { createAlignService } from '../vision/pipeline/alignService';
import { chooseWorkingSize } from '../vision/pipeline/budget';
import { createExposureService } from '../vision/pipeline/exposureService';
import { toRgba } from '../vision/pipeline/images.test-support';
import type {
  Decoders,
  Served,
  WorkerMessage,
  WorkerRequest,
} from '../vision/pipeline/protocol';
import { createStackService } from '../vision/pipeline/stackService';
import { createStackSession } from '../vision/pipeline/stackSession';
import type { CompositeParams, RgbaImage } from '../vision/types';
import { createFakePort } from './fakeWorkers.test-support';
import { runPipeline } from './runPipeline';
import type { WorkerFactory } from './workerPort';

// The real services and kernels behind in-process workers: a burst stacked in strips must render exactly as in one pass.

// Four bands tall and ten frames deep: strips of one band hold far less than every frame whole.
const SCENE = { width: 128, height: 256 };

/** The scene shifted by the "dx dy" a file names, with a bright walker at the x its third number gives. */
function photo(text: string): RgbaImage {
  const [dx, dy, walker] = text.split(' ').map(Number);
  const image = toRgba(
    shiftGray(texturedScene(SCENE.width, SCENE.height, 1), dx, dy),
  );
  for (let y = 60; y < 90; y += 1)
    for (let x = walker; x < walker + 8; x += 1)
      image.data.set([250, 240, 30], (y * SCENE.width + x) * 4);
  return image;
}

const decoders: Decoders = {
  decodeReference: async (file, sizing) => {
    const plan = chooseWorkingSize({ source: SCENE, ...sizing });
    // These decoders cannot resize: the budgets below are picked so the plan keeps the scene's own size.
    if (plan.width !== SCENE.width)
      throw new Error('The plan shrank the scene.');
    return {
      image: photo(await file.text()),
      source: SCENE,
      alignWorkers: plan.alignWorkers,
      stripRows: plan.stripRows,
      passes: plan.passes,
    };
  },
  decodeAt: async (file) => photo(await file.text()),
};

/** Every worker gets services of its own, as a real worker would. */
function realWorkers(): WorkerFactory {
  const port = () => {
    let serve:
      ((request: WorkerRequest) => Promise<Served<WorkerMessage>>) | null =
      null;
    return createFakePort((request, post) => {
      serve ??= createExposureService(
        createAlignService(decoders, () => false),
        createStackService(createStackSession(), post),
      );
      return serve(request as unknown as WorkerRequest);
    });
  };
  return { createAlignWorker: port, createStackWorker: port };
}

const BURST = Array.from(
  { length: 10 },
  (_, index) => `${(index % 5) - 2} ${(index % 3) - 1} ${8 + index * 11}`,
);

async function combine(budgetBytes: number) {
  const files = BURST.map((text) => new Blob([text]));
  return runPipeline({
    files,
    names: BURST,
    options: { quality: 'low', poolSize: 2, budgetBytes },
    workers: realWorkers(),
    onProgress: () => {},
  });
}

/** The smallest budget at which the scene keeps its size but no longer fits in one pass. */
function stripBudget(): number {
  for (let kibibytes = 1024; kibibytes < 16 * 1024; kibibytes += 16) {
    const plan = chooseWorkingSize({
      source: SCENE,
      frameCount: BURST.length,
      budgetBytes: kibibytes * 1024,
      maxLongEdge: 1024,
      requestedWorkers: 2,
    });
    if (plan.width === SCENE.width && plan.passes > 1) return kibibytes * 1024;
  }
  throw new Error('No budget splits the scene into strips.');
}

describe('a burst stacked in strips', () => {
  // Two real runs through ORB, RANSAC and the stack; mutation testing's instrumentation slows them severalfold.
  it('renders exactly as the same burst in one pass', async () => {
    const budget = stripBudget();
    expect(
      chooseWorkingSize({
        source: SCENE,
        frameCount: BURST.length,
        budgetBytes: budget,
        maxLongEdge: 1024,
        requestedWorkers: 2,
      }).passes,
    ).toBeGreaterThan(1);
    const whole = await combine(1024 * 1024 * 1024);
    const strips = await combine(budget);
    expect(whole.alignedCount).toBeGreaterThan(BURST.length / 2);
    expect(strips.alignedCount).toBe(whole.alignedCount);
    expect([strips.width, strips.height]).toEqual([whole.width, whole.height]);
    const looks: CompositeParams[] = [
      {
        background: 'median',
        ghostStrength: 0,
        ghostBlur: 0,
        glow: 0,
        trails: false,
      },
      {
        background: 'mode',
        ghostStrength: 0.8,
        ghostBlur: 4,
        glow: 0.6,
        trails: false,
      },
    ];
    for (const params of looks)
      expect(await strips.render(params)).toEqual(await whole.render(params));
    expect(await strips.renderReference()).toEqual(
      await whole.renderReference(),
    );
    whole.dispose();
    strips.dispose();
  }, 60_000);
});
