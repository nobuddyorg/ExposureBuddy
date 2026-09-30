// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { RgbaImage } from '../../vision/types';
import { deferred, rgbaImage } from './canvas.test-support';
import { fakeResult } from './result.test-support';
import { useCompare } from './useCompare';

describe('useCompare', () => {
  it('starts on the composite without touching the reference', () => {
    const renderReference = vi.fn(async () => rgbaImage(1, 1));
    const result = fakeResult({ renderReference });
    const { result: hook } = renderHook(() => useCompare(result));
    expect(hook.current.comparing).toBe(false);
    expect(hook.current.reference).toBeNull();
    expect(renderReference).not.toHaveBeenCalled();
  });

  it('shows the photo only while the image is held past the short delay', () => {
    vi.useFakeTimers();
    const result = fakeResult({ renderReference: async () => rgbaImage(1, 1) });
    const { result: hook } = renderHook(() => useCompare(result));

    act(() => hook.current.hold(true));
    act(() => void vi.advanceTimersByTime(149));
    expect(hook.current.comparing).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(hook.current.comparing).toBe(true);
    expect(hook.current.toggled).toBe(false);
    act(() => hook.current.hold(false));
    expect(hook.current.comparing).toBe(false);
    vi.useRealTimers();
  });

  it('never shows the photo when the touch ends before the delay', () => {
    vi.useFakeTimers();
    const result = fakeResult({ renderReference: async () => rgbaImage(1, 1) });
    const { result: hook } = renderHook(() => useCompare(result));

    act(() => hook.current.hold(true));
    act(() => hook.current.hold(false));
    act(() => void vi.advanceTimersByTime(500));
    expect(hook.current.comparing).toBe(false);
    vi.useRealTimers();
  });

  it('fetches the reference on the first press and keeps it for later ones', async () => {
    const reference = rgbaImage(4, 3, 200);
    const renderReference = vi.fn(async () => reference);
    const result = fakeResult({ renderReference });
    const { result: hook } = renderHook(() => useCompare(result));

    act(() => hook.current.toggle());
    expect(hook.current.comparing).toBe(true);
    await waitFor(() => expect(hook.current.reference).toBe(reference));

    act(() => hook.current.toggle());
    expect(hook.current.comparing).toBe(false);
    act(() => hook.current.toggle());
    expect(renderReference).toHaveBeenCalledOnce();
    expect(hook.current.reference).toBe(reference);
  });

  it('lets a failed fetch be tried again on the next press', async () => {
    const renderReference = vi
      .fn<() => Promise<RgbaImage>>()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(rgbaImage(4, 3, 9));
    const result = fakeResult({ renderReference });
    const { result: hook } = renderHook(() => useCompare(result));

    act(() => hook.current.toggle());
    await waitFor(() => expect(renderReference).toHaveBeenCalledOnce());
    act(() => hook.current.toggle());
    act(() => hook.current.toggle());
    await waitFor(() => expect(hook.current.reference).not.toBeNull());
    expect(renderReference).toHaveBeenCalledTimes(2);
  });

  it('drops a reference that arrives after unmount', async () => {
    const pending = deferred<RgbaImage>();
    const result = fakeResult({ renderReference: () => pending.promise });
    const { result: hook, unmount } = renderHook(() => useCompare(result));
    act(() => hook.current.toggle());
    unmount();
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    pending.resolve(rgbaImage(1, 1));
    await act(() => Promise.resolve());
    expect(hook.current.reference).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
