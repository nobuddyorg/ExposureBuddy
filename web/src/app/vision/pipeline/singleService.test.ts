import { describe, expect, it } from 'vitest';

import { EFFECTS } from '../effects/effectParams';
import { prepareScene, renderScene } from '../effects/render';
import {
  rectMask,
  solidImage,
  withRect,
} from '../effects/effects.test-support';
import type { GrayImage, RgbaImage } from '../types';
import type { SingleStage, SingleWorkerResponse } from './singleProtocol';
import {
  createSingleService,
  MIN_PERSON_COVERAGE,
  type SingleSteps,
} from './singleService';

const PERSON = { x: 20, y: 10, width: 10, height: 20 };
const photo = withRect(solidImage(60, 40, [90, 90, 90]), PERSON, [250, 0, 0]);
const FILE = new Blob(['photo']);
const PREPARE = {
  type: 'single-prepare',
  id: 1,
  file: FILE,
  longEdge: 1600,
  assetBase: 'https://example.test/ml',
} as const;

function setup(mask: GrayImage) {
  const progress: SingleWorkerResponse[] = [];
  const calls: { longEdge: number; assetBase: string; file: Blob }[] = [];
  const steps: SingleSteps = {
    decode: async (file, longEdge) => {
      calls.push({ longEdge, assetBase: '', file });
      return photo;
    },
    segmentPeople: async (image: RgbaImage, { assetBase, onProgress }) => {
      expect(image).toBe(photo);
      calls[0].assetBase = assetBase;
      onProgress('model', 5, 10);
      onProgress('detect', 0, 1);
      return mask;
    },
  };
  return {
    service: createSingleService(steps, (m) => progress.push(m)),
    progress,
    calls,
  };
}

const stagesOf = (messages: SingleWorkerResponse[]): SingleStage[] =>
  messages.flatMap((m) => (m.type === 'single-progress' ? [m.stage] : []));

describe('createSingleService', () => {
  it('decodes the photo to the asked size and segments it from the asked folder', async () => {
    const { service, calls } = setup(rectMask(60, 40, PERSON));
    await service(PREPARE);
    expect(calls).toEqual([
      { longEdge: 1600, assetBase: 'https://example.test/ml', file: FILE },
    ]);
  });

  it('reports every stage in order, tagged with the request id', async () => {
    const { service, progress } = setup(rectMask(60, 40, PERSON));
    await service({ ...PREPARE, id: 7 });
    expect(stagesOf(progress)).toEqual([
      'decode',
      'model',
      'detect',
      'prepare',
    ]);
    expect(progress[1]).toEqual({
      type: 'single-progress',
      id: 7,
      stage: 'model',
      done: 5,
      total: 10,
    });
    expect(progress[0]).toEqual({
      type: 'single-progress',
      id: 7,
      stage: 'decode',
      done: 0,
      total: 1,
    });
  });

  it('answers with the size of the photo and that someone was found', async () => {
    const { service } = setup(rectMask(60, 40, PERSON));
    const { response, transfer } = await service(PREPARE);
    expect(response).toEqual({
      type: 'single-prepared',
      id: 1,
      width: 60,
      height: 40,
      found: true,
    });
    expect(transfer).toEqual([]);
  });

  it('finds nobody in an empty mask, and then has nothing to render', async () => {
    const { service } = setup(
      rectMask(60, 40, { x: 0, y: 0, width: 0, height: 0 }),
    );
    const { response } = await service(PREPARE);
    expect(response).toMatchObject({ found: false, width: 60, height: 40 });
    await expect(
      service({
        type: 'single-render',
        id: 2,
        params: { effect: 'motion', strength: 0.5, angle: 0 },
      }),
    ).rejects.toThrow('No photo with people has been prepared.');
  });

  it('takes a speck of mask for noise, not for a person', async () => {
    const speck = rectMask(60, 40, { x: 0, y: 0, width: 1, height: 1 });
    expect(MIN_PERSON_COVERAGE).toBeGreaterThan(1 / (60 * 40));
    const { service } = setup(speck);
    expect((await service(PREPARE)).response).toMatchObject({ found: false });
  });

  it('takes a mask of exactly the minimum coverage for a person', async () => {
    // 60 × 40 = 2400 pixels; 0.2 % of them is 4.8, so 5 pixels are just over and 4 just under.
    const over = setup(rectMask(60, 40, { x: 10, y: 10, width: 5, height: 1 }));
    expect((await over.service(PREPARE)).response).toMatchObject({
      found: true,
    });
    const under = setup(
      rectMask(60, 40, { x: 10, y: 10, width: 4, height: 1 }),
    );
    expect((await under.service(PREPARE)).response).toMatchObject({
      found: false,
    });
  });

  it('takes a mask of exactly the minimum share of the photo for a person', async () => {
    // 100 × 50 = 5000 pixels, and 0.2 % of them is exactly 10.
    const small = solidImage(100, 50, [90, 90, 90]);
    const run = (width: number) =>
      createSingleService(
        {
          decode: async () => small,
          segmentPeople: async () =>
            rectMask(100, 50, { x: 0, y: 0, width, height: 1 }),
        },
        () => {},
      )(PREPARE);
    expect(MIN_PERSON_COVERAGE * 5000).toBeCloseTo(10, 9);
    expect((await run(10)).response).toMatchObject({ found: true });
    expect((await run(9)).response).toMatchObject({ found: false });
  });

  it('forgets an earlier photo when a new one finds nobody', async () => {
    const found = setup(rectMask(60, 40, PERSON));
    await found.service(PREPARE);
    const params = { effect: 'smear', strength: 0.4, angle: 20 } as const;
    await expect(
      found.service({ type: 'single-render', id: 2, params }),
    ).resolves.toBeDefined();
    const empty = setup(rectMask(60, 40, { x: 0, y: 0, width: 0, height: 0 }));
    await empty.service(PREPARE);
    await expect(
      empty.service({ type: 'single-render', id: 3, params }),
    ).rejects.toThrow();
  });

  it('renders every effect as an opaque photo of the same size and moves it out of the worker', async () => {
    const { service } = setup(rectMask(60, 40, PERSON));
    await service(PREPARE);
    for (const effect of EFFECTS) {
      const { response, transfer } = await service({
        type: 'single-render',
        id: 5,
        params: { effect, strength: 0.6, angle: 30 },
      });
      if (response.type !== 'single-rendered') throw new Error('not rendered');
      expect(response.id).toBe(5);
      expect([response.image.width, response.image.height]).toEqual([60, 40]);
      expect(response.image.data[3]).toBe(255);
      expect(transfer).toEqual([response.image.data.buffer]);
    }
  });

  it('renders the effect, not the original photo, and exactly what the kernels render', async () => {
    const mask = rectMask(60, 40, PERSON);
    const { service } = setup(mask);
    await service(PREPARE);
    const params = { effect: 'smear', strength: 0.7, angle: 20 } as const;
    const { response } = await service({
      type: 'single-render',
      id: 2,
      params,
    });
    if (response.type !== 'single-rendered') throw new Error('not rendered');
    const scene = prepareScene(photo, mask);
    if (!scene) throw new Error('the scene should have a person');
    expect(response.image.data).toEqual(renderScene(scene, params).data);
    expect(response.image.data).not.toEqual(photo.data);
  });

  it('renders the original untouched, as a copy that leaves the photo in place for the next render', async () => {
    const { service } = setup(rectMask(60, 40, PERSON));
    await service(PREPARE);
    const first = await service({ type: 'single-render-original', id: 3 });
    const second = await service({ type: 'single-render-original', id: 4 });
    if (
      first.response.type !== 'single-rendered' ||
      second.response.type !== 'single-rendered'
    )
      throw new Error('not rendered');
    expect(first.response.image.data).toEqual(photo.data);
    expect(first.response.image.data).not.toBe(photo.data);
    expect(second.response.image.data).toEqual(photo.data);
  });

  it('refuses a request it does not know', async () => {
    const { service } = setup(rectMask(60, 40, PERSON));
    const unknown = { type: 'align', id: 9 } as unknown as Parameters<
      typeof service
    >[0];
    await expect(service(unknown)).rejects.toThrow(
      'The single-photo worker got a request it does not know: align.',
    );
  });
});
