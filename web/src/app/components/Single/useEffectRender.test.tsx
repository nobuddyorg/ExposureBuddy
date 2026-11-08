// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SingleResult } from '../../exposure/runSingle';
import { DEFAULT_EFFECT_PARAMS } from '../../vision/effects/effectParams';
import { deferred, rgbaImage } from '../Result/canvas.test-support';
import { useEffectRender } from './useEffectRender';

function fakeSingle(render: SingleResult['render']): SingleResult {
  return {
    width: 4,
    height: 3,
    render,
    renderReference: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('useEffectRender', () => {
  it('renders the default effect at once and keeps the image', async () => {
    const image = rgbaImage(4, 3, 50);
    const render = vi.fn(async () => image);
    const { result } = renderHook(() => useEffectRender(fakeSingle(render)));
    expect(result.current.params).toEqual(DEFAULT_EFFECT_PARAMS);
    expect(render).toHaveBeenCalledExactlyOnceWith(DEFAULT_EFFECT_PARAMS);
    await waitFor(() => expect(result.current.image).toBe(image));
    expect(result.current.error).toBe('');
  });

  it('renders a change after the debounce, and only the newest of several quick ones', async () => {
    vi.useFakeTimers();
    try {
      const render = vi.fn(async () => rgbaImage(4, 3, 1));
      const single = fakeSingle(render);
      const { result } = renderHook(() => useEffectRender(single));
      await act(async () => {});
      render.mockClear();
      act(() =>
        result.current.setParams({ ...DEFAULT_EFFECT_PARAMS, strength: 0.6 }),
      );
      act(() =>
        result.current.setParams({ ...DEFAULT_EFFECT_PARAMS, strength: 0.8 }),
      );
      expect(render).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(80);
      });
      expect(render).toHaveBeenCalledExactlyOnceWith({
        ...DEFAULT_EFFECT_PARAMS,
        strength: 0.8,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a slow render that resolves after a newer one', async () => {
    const slow = deferred<ReturnType<typeof rgbaImage>>();
    const fast = rgbaImage(4, 3, 9);
    const render = vi
      .fn<SingleResult['render']>()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValue(fast);
    const { result } = renderHook(() => useEffectRender(fakeSingle(render)));
    act(() =>
      result.current.setParams({ ...DEFAULT_EFFECT_PARAMS, effect: 'smoke' }),
    );
    await waitFor(() => expect(result.current.image).toBe(fast));
    await act(async () => slow.resolve(rgbaImage(4, 3, 1)));
    expect(result.current.image).toBe(fast);
  });

  it('reports a render that failed', async () => {
    const render = vi.fn(async () => {
      throw new Error('out of memory');
    });
    const { result } = renderHook(() => useEffectRender(fakeSingle(render)));
    await waitFor(() => expect(result.current.error).not.toBe(''));
    expect(result.current.error).toContain('out of memory');
  });

  it('sets no state once unmounted', async () => {
    const pending = deferred<ReturnType<typeof rgbaImage>>();
    const render = vi.fn(() => pending.promise);
    const { result, unmount } = renderHook(() =>
      useEffectRender(fakeSingle(render)),
    );
    unmount();
    await act(async () => pending.resolve(rgbaImage(4, 3, 1)));
    expect(result.current.image).toBeNull();
  });
});
