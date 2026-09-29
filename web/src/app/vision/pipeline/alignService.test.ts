import { describe, expect, it } from 'vitest';

import { shiftGray, texturedScene } from '../features/synthetic.test-support';
import type { AlignWorkerResponse, Decoders } from './protocol';
import { createAlignService } from './alignService';
import type { Size } from '../types';
import { toRgba } from './images.test-support';

const SCENE: Size = { width: 200, height: 150 };
const SHIFT = { x: 6, y: -4 };

class Unreadable extends Error {}

/** Decoders that answer from the blob's text: 'scene', 'shifted', 'noise' or 'bad'. */
const decoders: Decoders = {
  decodeReference: async (file) => {
    if ((await file.text()) === 'bad') throw new Unreadable('nope');
    const image = toRgba(texturedScene(SCENE.width, SCENE.height, 1));
    return { image, source: SCENE };
  },
  decodeAt: async (file) => {
    const verdict = await file.text();
    if (verdict === 'bad') throw new Unreadable('nope');
    if (verdict === 'crash') throw new Error('disk on fire');
    const scene = texturedScene(
      SCENE.width,
      SCENE.height,
      verdict === 'noise' ? 99 : 1,
    );
    return toRgba(
      verdict === 'shifted' ? shiftGray(scene, SHIFT.x, SHIFT.y) : scene,
    );
  },
};

const blob = (text: string) => new Blob([text]);
const isUnreadable = (error: unknown) => error instanceof Unreadable;
const sizing = {
  frameCount: 3,
  budgetBytes: 256 * 1024 * 1024,
  maxLongEdge: 1024,
};

async function primed() {
  const serve = createAlignService(decoders, isUnreadable);
  const decoded = await serve({
    type: 'decode-reference',
    id: 1,
    file: blob('scene'),
    sizing,
  });
  const response = decoded.response as Extract<
    AlignWorkerResponse,
    { type: 'reference-decoded' }
  >;
  const acknowledged = await serve({
    type: 'set-reference',
    id: 2,
    features: response.features,
  });
  expect(acknowledged).toEqual({
    response: { type: 'reference-set', id: 2 },
    transfer: [],
  });
  return { serve, reference: response };
}

describe('createAlignService', () => {
  it('decodes the reference, describes it, and moves its pixels', async () => {
    const serve = createAlignService(decoders, isUnreadable);
    const { response, transfer } = await serve({
      type: 'decode-reference',
      id: 1,
      file: blob('scene'),
      sizing,
    });
    expect(response).toMatchObject({
      type: 'reference-decoded',
      id: 1,
      source: SCENE,
    });
    const decoded = response as Extract<
      AlignWorkerResponse,
      { type: 'reference-decoded' }
    >;
    expect(decoded.features.keypoints.length).toBeGreaterThan(50);
    expect(transfer).toEqual([decoded.image.data.buffer]);
  });

  it('lets a decode error that is not an unreadable file through', async () => {
    const serve = createAlignService(
      {
        ...decoders,
        decodeReference: () => Promise.reject(new Error('disk on fire')),
      },
      isUnreadable,
    );
    await expect(
      serve({ type: 'decode-reference', id: 1, file: blob('scene'), sizing }),
    ).rejects.toThrow('disk on fire');
  });

  it('reports an unreadable reference instead of failing', async () => {
    const serve = createAlignService(decoders, isUnreadable);
    await expect(
      serve({ type: 'decode-reference', id: 1, file: blob('bad'), sizing }),
    ).resolves.toEqual({
      response: { type: 'unreadable', id: 1 },
      transfer: [],
    });
  });

  it('rejects a request meant for another worker, naming it', async () => {
    const serve = createAlignService(decoders, isUnreadable);
    await expect(serve({ type: 'add-frame', id: 9 } as never)).rejects.toThrow(
      'The align service got a request it does not know: add-frame.',
    );
  });

  it('refuses to align before the reference is set', async () => {
    const serve = createAlignService(decoders, isUnreadable);
    await expect(
      serve({ type: 'align', id: 3, file: blob('shifted'), target: SCENE }),
    ).rejects.toThrow(/set-reference/);
  });

  it('aligns a shifted copy of the scene back onto the reference', async () => {
    const { serve, reference } = await primed();
    const { response, transfer } = await serve({
      type: 'align',
      id: 3,
      file: blob('shifted'),
      target: SCENE,
    });
    expect(response).toMatchObject({ type: 'aligned', id: 3 });
    const aligned = response as Extract<
      AlignWorkerResponse,
      { type: 'aligned' }
    >;
    expect(aligned.inliers).toBeGreaterThan(20);
    expect(transfer).toEqual([
      aligned.frame.image.data.buffer,
      aligned.frame.coverage.buffer,
    ]);

    // Where the warped frame has data it must show the reference's pixels again.
    const { image, coverage } = aligned.frame;
    let difference = 0;
    let count = 0;
    for (let index = 0; index < coverage.length; index += 1) {
      if (!coverage[index]) continue;
      difference += Math.abs(
        image.data[index * 4] - reference.image.data[index * 4],
      );
      count += 1;
    }
    expect(count).toBeGreaterThan(coverage.length * 0.8);
    expect(difference / count).toBeLessThan(6);
  });

  it('skips an unrelated frame and reports its counts', async () => {
    const { serve } = await primed();
    const { response, transfer } = await serve({
      type: 'align',
      id: 4,
      file: blob('noise'),
      target: SCENE,
    });
    expect(response).toMatchObject({ type: 'skipped', id: 4 });
    expect(transfer).toEqual([]);
  });

  it('reports an unreadable frame and lets any other decode error through', async () => {
    const { serve } = await primed();
    await expect(
      serve({ type: 'align', id: 5, file: blob('bad'), target: SCENE }),
    ).resolves.toEqual({
      response: { type: 'unreadable', id: 5 },
      transfer: [],
    });
    await expect(
      serve({ type: 'align', id: 6, file: blob('crash'), target: SCENE }),
    ).rejects.toThrow('disk on fire');
  });
});
