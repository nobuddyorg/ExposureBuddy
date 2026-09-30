// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installCanvasStubs, type CanvasStubs } from './canvas.test-support';
import { canvasToJpeg, saveBlob, REVOKE_DELAY_MS } from './canvasExport';

let stubs: CanvasStubs;

beforeEach(() => {
  stubs = installCanvasStubs();
});

afterEach(() => {
  stubs.restore();
  vi.restoreAllMocks();
});

describe('canvasToJpeg', () => {
  it('asks the canvas for a JPEG at quality 0.92', async () => {
    const canvas = document.createElement('canvas');
    const blob = await canvasToJpeg(canvas);
    expect(blob.type).toBe('image/jpeg');
    expect(stubs.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.92,
    );
  });

  it('rejects when the browser encodes nothing', async () => {
    stubs.toBlob.mockImplementation((callback: BlobCallback) => callback(null));
    await expect(
      canvasToJpeg(document.createElement('canvas')),
    ).rejects.toThrow('could not be encoded');
  });
});

describe('saveBlob', () => {
  it('clicks a transient download anchor for the blob and revokes its URL afterwards', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:exposure');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
      expect(document.body.contains(this)).toBe(true);
    });
    const blob = new Blob(['x'], { type: 'image/jpeg' });

    await saveBlob(blob, 'shot.jpg');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].getAttribute('href')).toBe('blob:exposure');
    expect(clicked[0].download).toBe('shot.jpg');
    expect(clicked[0].rel).toBe('noopener');
    expect(document.body.contains(clicked[0])).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    // iOS Safari reads the URL only once its download sheet is confirmed, so the revoke waits a minute.
    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:exposure');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('writes through the save dialog where the browser has one', async () => {
    const write = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    const showSaveFilePicker = vi.fn(async () => ({
      createWritable: async () => ({ write, close }),
    }));
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);
    const blob = new Blob(['x'], { type: 'image/jpeg' });

    await saveBlob(blob, 'shot.jpg');

    expect(showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'shot.jpg',
      types: [{ accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }],
    });
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('rejects when the save dialog is cancelled', async () => {
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn(() => Promise.reject(new DOMException('cancelled', 'AbortError'))),
    );
    await expect(
      saveBlob(new Blob(['x'], { type: 'image/jpeg' }), 'shot.jpg'),
    ).rejects.toMatchObject({ name: 'AbortError' });
    vi.unstubAllGlobals();
  });
});
