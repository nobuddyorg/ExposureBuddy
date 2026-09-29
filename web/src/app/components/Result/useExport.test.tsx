// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installCanvasStubs, type CanvasStubs } from './canvas.test-support';
import { useExport, type ExportOptions } from './useExport';

let stubs: CanvasStubs;

beforeEach(() => {
  stubs = installCanvasStubs();
});

afterEach(() => {
  stubs.restore();
});

const NOW = () => new Date(2026, 8, 28, 14, 32);
const EXPECTED_NAME = 'exposurebuddy-2026-09-28-1432.jpg';

function setup(options: Partial<ExportOptions> = {}) {
  const canvas = document.createElement('canvas');
  const save = vi.fn();
  const hook = renderHook(() =>
    useExport({ current: canvas }, { save, now: NOW, ...options }),
  );
  return { ...hook, save };
}

const sharer = (share: (data: ShareData) => Promise<void>) => ({
  canShare: () => true,
  share,
});

describe('useExport: download', () => {
  it('encodes the canvas, saves it under the dated name and reports it', async () => {
    const { result, save } = setup();
    await act(() => result.current.download());
    expect(save).toHaveBeenCalledOnce();
    const [file, name] = save.mock.calls[0] as [File, string];
    expect(name).toBe(EXPECTED_NAME);
    expect(file.name).toBe(EXPECTED_NAME);
    expect(file.type).toBe('image/jpeg');
    expect(result.current.status).toEqual({
      kind: 'saved',
      name: EXPECTED_NAME,
    });
  });

  it('reports a canvas that cannot be encoded', async () => {
    stubs.toBlob.mockImplementation((callback: BlobCallback) => callback(null));
    const { result, save } = setup();
    await act(() => result.current.download());
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({
      kind: 'failed',
      message: 'The canvas could not be encoded as JPEG.',
    });
  });

  it('reports a missing canvas instead of throwing', async () => {
    const save = vi.fn();
    const { result } = renderHook(() =>
      useExport({ current: null }, { save, now: NOW }),
    );
    await act(() => result.current.download());
    expect(result.current.status).toMatchObject({ kind: 'failed' });
  });
});

describe('useExport: share support', () => {
  it('answers unsupported in the prerender, before any navigator is asked', () => {
    const canShare = vi.fn(() => true);
    function Probe() {
      const { shareSupported } = useExport(
        { current: null },
        { sharer: { canShare, share: vi.fn() } },
      );
      return <span>{String(shareSupported)}</span>;
    }
    expect(renderToString(<Probe />)).toContain('false');
    expect(canShare).not.toHaveBeenCalled();
  });

  it('is off without a file-capable Web Share API', () => {
    const { result } = setup();
    expect(result.current.shareSupported).toBe(false);
  });

  it('is on when the sharer accepts a JPEG file', async () => {
    const canShare = vi.fn(() => true);
    const { result } = setup({ sharer: { canShare, share: vi.fn() } });
    await waitFor(() => expect(result.current.shareSupported).toBe(true));
    const [probe] = canShare.mock.calls[0] as unknown as [ShareData];
    expect(probe.files?.[0].type).toBe('image/jpeg');
  });
});

describe('useExport: share', () => {
  it('hands the file and the title to the sharer', async () => {
    const share = vi.fn(async () => {});
    const { result, save } = setup({ sharer: sharer(share) });
    await act(() => result.current.share('My exposure'));
    const [data] = share.mock.calls[0] as unknown as [ShareData];
    expect(data.title).toBe('My exposure');
    expect(data.files?.[0].name).toBe(EXPECTED_NAME);
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: 'idle' });
  });

  it('falls back to a save when sharing fails for any other reason', async () => {
    const share = vi.fn(() => Promise.reject(new Error('no target')));
    const { result, save } = setup({ sharer: sharer(share) });
    await act(() => result.current.share('x'));
    expect(save).toHaveBeenCalledWith(expect.any(File), EXPECTED_NAME);
    expect(result.current.status).toEqual({
      kind: 'share_failed',
      name: EXPECTED_NAME,
    });
  });

  it('stays silent when the visitor dismissed the share sheet', async () => {
    const share = vi.fn(() =>
      Promise.reject(new DOMException('dismissed', 'AbortError')),
    );
    const { result, save } = setup({ sharer: sharer(share) });
    await act(() => result.current.share('x'));
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: 'idle' });
  });

  it('reports an encoding failure before any sharing', async () => {
    stubs.toBlob.mockImplementation((callback: BlobCallback) => callback(null));
    const share = vi.fn(async () => {});
    const { result } = setup({ sharer: sharer(share) });
    await act(() => result.current.share('x'));
    expect(share).not.toHaveBeenCalled();
    expect(result.current.status).toMatchObject({ kind: 'failed' });
  });

  it('does nothing without a share function, as the button is hidden then', async () => {
    const { result, save } = setup({ sharer: { canShare: () => true } });
    await act(() => result.current.share('x'));
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toEqual({ kind: 'idle' });
  });
});
