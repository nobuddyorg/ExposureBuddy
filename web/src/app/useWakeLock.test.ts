// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWakeLock } from './useWakeLock';

function fakeWakeLock() {
  const release = vi.fn(() => Promise.resolve());
  const request = vi.fn(() =>
    Promise.resolve({ release } as unknown as WakeLockSentinel),
  );
  vi.stubGlobal('navigator', { wakeLock: { request } });
  return { request, release };
}

function defineVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

function setVisibility(state: DocumentVisibilityState) {
  defineVisibility(state);
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useWakeLock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    defineVisibility('visible');
  });

  it('asks for a screen lock while active', async () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  });

  it('asks for nothing while inactive', () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps the lock while still active', async () => {
    const { request, release } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(release).not.toHaveBeenCalled();
  });

  it('releases every lock it took once no longer active', async () => {
    const { request, release } = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    setVisibility('visible');
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    unmount();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('releases the lock once no longer active', async () => {
    const { request, release } = fakeWakeLock();
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    await Promise.resolve();
    rerender({ active: false });
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases a lock granted only after the run ended', async () => {
    const { release } = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    unmount();
    await waitFor(() => expect(release).toHaveBeenCalledOnce());
  });

  it('takes the lock again when the page becomes visible', async () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    setVisibility('hidden');
    expect(request).toHaveBeenCalledOnce();
    setVisibility('visible');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('stops listening for visibility once inactive', async () => {
    const { request } = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    unmount();
    setVisibility('visible');
    expect(request).toHaveBeenCalledOnce();
  });

  it('reports a refused lock and carries on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refusal = new DOMException('denied', 'NotAllowedError');
    vi.stubGlobal('navigator', {
      wakeLock: { request: vi.fn(() => Promise.reject(refusal)) },
    });
    renderHook(() => useWakeLock(true));
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Screen wake lock refused:', refusal),
    );
  });

  it('does nothing in a browser without the Screen Wake Lock API', () => {
    vi.stubGlobal('navigator', {});
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
