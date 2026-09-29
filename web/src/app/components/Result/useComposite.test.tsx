// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_COMPOSITE_PARAMS } from '../../vision/stack/compositeParams';
import type { RgbaImage } from '../../vision/types';
import { deferred, rgbaImage } from './canvas.test-support';
import { fakeResult } from './result.test-support';
import { useComposite } from './useComposite';

const tick = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 5)));

const PARAMS_A = { ghostStrength: 0.1, ghostBlur: 1, glow: 0.1 };
const PARAMS_B = { ghostStrength: 0.9, ghostBlur: 9, glow: 0.9 };

describe('useComposite', () => {
  it('renders the defaults at once on mount and exposes the image', async () => {
    const image = rgbaImage(4, 3, 7);
    const render = vi.fn(async () => image);
    const result = fakeResult({ render });
    const { result: hook } = renderHook(() => useComposite(result));
    expect(hook.current.params).toEqual(DEFAULT_COMPOSITE_PARAMS);
    expect(render).toHaveBeenCalledExactlyOnceWith(DEFAULT_COMPOSITE_PARAMS);
    await waitFor(() => expect(hook.current.image).toBe(image));
    expect(hook.current.error).toBe('');
  });

  it('debounces later renders so a burst of changes renders once', async () => {
    const render = vi.fn(async () => rgbaImage(4, 3));
    const result = fakeResult({ render });
    const { result: hook } = renderHook(() =>
      useComposite(result, { debounceMs: 20 }),
    );
    await tick();
    act(() => hook.current.setParams(PARAMS_A));
    act(() => hook.current.setParams(PARAMS_B));
    expect(render).toHaveBeenCalledOnce();
    await waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    expect(render).toHaveBeenLastCalledWith(PARAMS_B);
  });

  it('draws only the newest render when an older one resolves later', async () => {
    const first = deferred<RgbaImage>();
    const second = deferred<RgbaImage>();
    const answers = [first.promise, second.promise];
    const render = vi.fn(
      () => answers.shift() ?? Promise.resolve(rgbaImage(1, 1)),
    );
    const result = fakeResult({ render });
    const { result: hook } = renderHook(() =>
      useComposite(result, { debounceMs: 0 }),
    );
    await tick();
    act(() => hook.current.setParams(PARAMS_A));
    await tick();
    expect(render).toHaveBeenCalledTimes(2);

    const newest = rgbaImage(4, 3, 2);
    await act(async () => {
      second.resolve(newest);
      await Promise.resolve();
    });
    expect(hook.current.image).toBe(newest);

    await act(async () => {
      first.resolve(rgbaImage(4, 3, 1));
      await Promise.resolve();
    });
    expect(hook.current.image).toBe(newest);
  });

  it('surfaces the message of a render that failed', async () => {
    const result = fakeResult({
      render: vi.fn(() => Promise.reject(new Error('worker gone'))),
    });
    const { result: hook } = renderHook(() => useComposite(result));
    await waitFor(() => expect(hook.current.error).toBe('worker gone'));
    expect(hook.current.image).toBeNull();
  });

  it('describes a non-Error rejection as text', async () => {
    const render = vi.fn<() => Promise<RgbaImage>>().mockRejectedValue('boom');
    const result = fakeResult({ render });
    const { result: hook } = renderHook(() => useComposite(result));
    await waitFor(() => expect(hook.current.error).toBe('boom'));
  });

  it('ignores the failure of a render a newer one has replaced', async () => {
    const first = deferred<RgbaImage>();
    const answers = [first.promise, Promise.resolve(rgbaImage(4, 3, 3))];
    const render = vi.fn(
      () => answers.shift() ?? Promise.resolve(rgbaImage(1, 1)),
    );
    const result = fakeResult({ render });
    const { result: hook } = renderHook(() =>
      useComposite(result, { debounceMs: 0 }),
    );
    await tick();
    act(() => hook.current.setParams(PARAMS_A));
    await tick();
    await act(async () => {
      first.reject(new Error('too late'));
      await Promise.resolve();
    });
    expect(hook.current.error).toBe('');
    expect(hook.current.image).not.toBeNull();
  });

  it('ignores a render that settles after unmount', async () => {
    const pending = deferred<RgbaImage>();
    const result = fakeResult({ render: vi.fn(() => pending.promise) });
    const { result: hook, unmount } = renderHook(() => useComposite(result));
    unmount();
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    pending.resolve(rgbaImage(1, 1));
    await tick();
    expect(hook.current.image).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
