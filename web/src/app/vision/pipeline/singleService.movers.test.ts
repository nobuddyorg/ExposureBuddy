import { describe, expect, it } from 'vitest';

import { rectMask, solidImage } from '../effects/effects.test-support';
import type { DetectionDetail } from '../effects/tiles';
import type { GrayImage, Homography, RgbaImage } from '../types';
import { ALIGNMENT_LONG_EDGE } from './budget';
import type {
  SingleWorkerRequest,
  SingleWorkerResponse,
} from './singleProtocol';
import {
  createSingleService,
  MOVER_MARGIN_SHARE,
  type SingleSteps,
} from './singleService';

const translation = (dx: number, dy: number): Homography =>
  Float64Array.from([1, 0, dx, 0, 1, dy, 0, 0, 1]);

const FIRST = new Blob(['first']);
const SECOND = new Blob(['second']);

function movers(
  overrides: Partial<
    Extract<SingleWorkerRequest, { type: 'movers-masks' }>
  > = {},
) {
  return {
    type: 'movers-masks',
    id: 4,
    items: [
      { file: FIRST, homography: translation(0, 0) },
      { file: SECOND, homography: translation(10, 0) },
    ],
    working: { width: 1000, height: 500 },
    assetBase: 'https://example.test/ml',
    detail: 'fast',
    ...overrides,
  } as const satisfies SingleWorkerRequest;
}

function setup(decoded: RgbaImage, found: GrayImage[]) {
  const progress: SingleWorkerResponse[] = [];
  const seen: {
    longEdge: number;
    file: Blob;
    detail?: DetectionDetail;
    assetBase?: string;
    images?: number;
  }[] = [];
  const steps: SingleSteps = {
    decode: async (file, longEdge) => {
      seen.push({ longEdge, file });
      return decoded;
    },
    decodeAt: async (file, size) => {
      seen.push({ longEdge: -size.width, file });
      return decoded;
    },
    segmentPeople: async () =>
      rectMask(1, 1, { x: 0, y: 0, width: 1, height: 1 }),
    segmentMovers: async (images, { assetBase, detail, onFrame }) => {
      seen.push({
        longEdge: 0,
        file: FIRST,
        assetBase,
        detail,
        images: images.length,
      });
      images.forEach((_, index) => onFrame(index + 1));
      return found;
    },
  };
  return {
    service: createSingleService(steps, (m) => progress.push(m)),
    progress,
    seen,
  };
}

describe('createSingleService, movers', () => {
  const decoded = solidImage(100, 50, [10, 10, 10]);
  const found = [
    rectMask(100, 50, { x: 10, y: 5, width: 4, height: 4 }),
    rectMask(100, 50, { x: 10, y: 5, width: 4, height: 4 }),
  ];

  it('decodes every photo to the alignment size and searches them all with one model load', async () => {
    const { service, seen } = setup(decoded, found);
    await service(movers());
    expect(seen.filter((call) => call.images === undefined)).toEqual([
      { longEdge: ALIGNMENT_LONG_EDGE, file: FIRST },
      { longEdge: ALIGNMENT_LONG_EDGE, file: SECOND },
    ]);
    expect(seen.at(-1)).toMatchObject({
      assetBase: 'https://example.test/ml',
      detail: 'fast',
      images: 2,
    });
  });

  it('decodes no larger than the working size when that is smaller than the alignment size', async () => {
    const { service, seen } = setup(decoded, found);
    await service(movers({ working: { width: 300, height: 200 } }));
    expect(seen[0].longEdge).toBe(300);
  });

  it('lays each mask over the reference through its own transform, scaled to the mask size', async () => {
    const { service } = setup(decoded, found);
    const { response } = await service(movers());
    if (response.type !== 'movers-masked') throw new Error('wrong response');
    const [first, second] = response.masks;
    // The decoded photo is a tenth of the working width, so a shift of 10 working pixels is 1 pixel here.
    expect(first.data[5 * 100 + 10]).toBe(255);
    // A margin of one pixel on a 100 px photo: the shifted mask starts at x = 11, so x = 10 is its margin and x = 9 is clear.
    expect(second.data[5 * 100 + 9]).toBe(0);
    expect(second.data[5 * 100 + 10]).toBe(255);
    expect(second.data[5 * 100 + 11]).toBe(255);
    expect(response.id).toBe(4);
  });

  it('grows every mask by a share of the long edge, at least one pixel', async () => {
    const wide = solidImage(1000, 500, [10, 10, 10]);
    const point = rectMask(1000, 500, { x: 500, y: 250, width: 1, height: 1 });
    const { service } = setup(wide, [point, point]);
    const { response } = await service(
      movers({ working: { width: 1000, height: 500 } }),
    );
    if (response.type !== 'movers-masked') throw new Error('wrong response');
    const radius = Math.round(MOVER_MARGIN_SHARE * 1000);
    const row = response.masks[0].data.subarray(250 * 1000, 251 * 1000);
    expect(row[500 - radius]).toBe(255);
    expect(row[500 - radius - 1]).toBe(0);
    expect(row[500 + radius]).toBe(255);
    expect(row[500 + radius + 1]).toBe(0);
  });

  it('reports the photos searched so far, tagged with the request id', async () => {
    const { service, progress } = setup(decoded, found);
    await service(movers());
    expect(progress).toEqual([
      { type: 'movers-progress', id: 4, done: 0, total: 2 },
      { type: 'movers-progress', id: 4, done: 1, total: 2 },
      { type: 'movers-progress', id: 4, done: 2, total: 2 },
    ]);
  });

  it('moves the masks out of the worker instead of copying them', async () => {
    const { service } = setup(decoded, found);
    const { transfer, response } = await service(movers());
    if (response.type !== 'movers-masked') throw new Error('wrong response');
    expect(transfer).toHaveLength(2);
    expect(transfer).toContain(response.masks[0].data.buffer);
  });

  describe('with the blur asked for', () => {
    const working = { width: 100, height: 50 };
    const blur = {
      effect: 'motion',
      strength: 0.5,
      angle: 0,
      grow: 0,
    } as const;

    it('answers with the mean of the frames with their movers blurred, at the working size', async () => {
      const { service } = setup(decoded, found);
      const { response } = await service(movers({ working, blur }));
      if (response.type !== 'movers-masked') throw new Error('wrong response');
      expect(response.blurred).toMatchObject({ width: 100, height: 50 });
      expect(response.blurred?.data).toHaveLength(100 * 50 * 4);
    });

    it('decodes each chosen frame at exactly the working size', async () => {
      const { service, seen } = setup(decoded, found);
      await service(movers({ working, blur }));
      const exact = seen.filter((call) => call.longEdge === -100);
      expect(exact.map((call) => call.file)).toEqual([FIRST, SECOND]);
    });

    it('counts the blurred frames in the progress, after the searched ones', async () => {
      const { service, progress } = setup(decoded, found);
      await service(movers({ working, blur }));
      expect(
        progress.map((m) =>
          m.type === 'movers-progress' ? [m.done, m.total] : [],
        ),
      ).toEqual([
        [0, 4],
        [1, 4],
        [2, 4],
        [3, 4],
        [4, 4],
      ]);
    });

    it('moves the blurred image out of the worker with the masks', async () => {
      const { service } = setup(decoded, found);
      const { transfer, response } = await service(movers({ working, blur }));
      if (response.type !== 'movers-masked') throw new Error('wrong response');
      expect(transfer).toContain(response.blurred?.data.buffer);
      expect(transfer).toHaveLength(3);
    });

    it('answers without a blurred image when none was asked for', async () => {
      const { service } = setup(decoded, found);
      const { response } = await service(movers({ working }));
      if (response.type !== 'movers-masked') throw new Error('wrong response');
      expect('blurred' in response).toBe(false);
    });
  });
});
