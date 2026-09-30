import { describe, expect, it, vi } from 'vitest';

import { flatFrame } from '../stack/synthetic.test-support';
import type { StackWorkerResponse } from './protocol';
import type { StackSession } from './stackSession';
import { createStackService } from './stackService';

const image = (fill: number) => ({
  width: 2,
  height: 1,
  data: new Uint8ClampedArray(8).fill(fill),
});

const SUMMARY = {
  width: 2,
  height: 1,
  rect: { x: 0, y: 0, width: 2, height: 1 },
  frameCount: 2,
};

function fakeSession() {
  const session: StackSession & { calls: string[] } = {
    calls: [],
    frameCount: 0,
    addReference: vi.fn(() => session.calls.push('reference')),
    addFrame: vi.fn(() => session.calls.push('frame')),
    crop: vi.fn(() => SUMMARY),
    stackRows: vi.fn((_rows, onProgress?: (fraction: number) => void) => {
      onProgress?.(0.5);
      onProgress?.(1);
    }),
    addRows: vi.fn(() => session.calls.push('rows')),
    render: vi.fn(() => image(5)),
    renderReference: vi.fn(() => image(7)),
    dispose: vi.fn(),
  };
  return session;
}

describe('createStackService', () => {
  it('routes each request to the session and answers with its id', async () => {
    const session = fakeSession();
    const posted: StackWorkerResponse[] = [];
    const serve = createStackService(session, (message) =>
      posted.push(message),
    );

    const reference = image(1);
    await expect(
      serve({ type: 'add-reference', id: 1, image: reference, stripRows: 64 }),
    ).resolves.toEqual({ response: { type: 'added', id: 1 }, transfer: [] });
    expect(session.addReference).toHaveBeenCalledWith(reference, 64);

    const frame = flatFrame({ width: 2, height: 1 }, [2, 2, 2]);
    await expect(
      serve({ type: 'add-frame', id: 2, index: 4, frame }),
    ).resolves.toEqual({ response: { type: 'added', id: 2 }, transfer: [] });
    expect(session.addFrame).toHaveBeenCalledWith(4, frame);

    await expect(serve({ type: 'crop', id: 3 })).resolves.toEqual({
      response: { type: 'cropped', id: 3, ...SUMMARY },
      transfer: [],
    });

    const rows = { start: 0, end: 64 };
    await expect(serve({ type: 'stack-rows', id: 4, rows })).resolves.toEqual({
      response: { type: 'stacked', id: 4 },
      transfer: [],
    });
    expect(session.stackRows).toHaveBeenCalledWith(rows, expect.any(Function));
    expect(posted).toEqual([
      { type: 'stack-progress', id: 4, fraction: 0.5 },
      { type: 'stack-progress', id: 4, fraction: 1 },
    ]);

    const strip = { start: 64, end: 128 };
    await expect(
      serve({ type: 'add-rows', id: 5, index: 4, frame, rows: strip }),
    ).resolves.toEqual({ response: { type: 'added', id: 5 }, transfer: [] });
    expect(session.addRows).toHaveBeenCalledWith(4, frame, strip);
  });

  it('renders through the session and moves the pixel buffer', async () => {
    const session = fakeSession();
    const serve = createStackService(session, () => {});
    const params = {
      background: 'median' as const,
      ghostStrength: 0.5,
      ghostBlur: 2,
      glow: 0,
      trails: false,
    };

    const rendered = await serve({ type: 'render', id: 4, params });
    expect(session.render).toHaveBeenCalledWith(params);
    expect(rendered.response).toMatchObject({ type: 'rendered', id: 4 });
    const renderedImage = (
      rendered.response as { image: { data: Uint8ClampedArray } }
    ).image;
    expect(renderedImage.data[0]).toBe(5);
    expect(rendered.transfer).toEqual([renderedImage.data.buffer]);

    const reference = await serve({ type: 'render-reference', id: 5 });
    expect(reference.response).toMatchObject({ type: 'rendered', id: 5 });
    const referenceImage = (
      reference.response as { image: { data: Uint8ClampedArray } }
    ).image;
    expect(referenceImage.data[0]).toBe(7);
    expect(reference.transfer).toEqual([referenceImage.data.buffer]);
  });

  it('rejects a request meant for another worker, naming it', async () => {
    const serve = createStackService(fakeSession(), () => {});
    await expect(serve({ type: 'align', id: 7 } as never)).rejects.toThrow(
      'The stack service got a request it does not know: align.',
    );
  });

  it('lets a session error propagate as a rejection', async () => {
    const session = fakeSession();
    session.render = vi.fn(() => {
      throw new Error('nothing stacked');
    });
    const serve = createStackService(session, () => {});
    await expect(
      serve({
        type: 'render',
        id: 6,
        params: {
          background: 'median' as const,
          ghostStrength: 0,
          ghostBlur: 0,
          glow: 0,
          trails: false,
        },
      }),
    ).rejects.toThrow('nothing stacked');
  });
});
