// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installCanvasStubs, type CanvasStubs } from './canvas.test-support';
import { canvasToJpeg, saveBlob } from './canvasExport';

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
  it('clicks a transient download anchor for the blob and revokes its URL afterwards', () => {
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

    saveBlob(blob, 'shot.jpg');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].getAttribute('href')).toBe('blob:exposure');
    expect(clicked[0].download).toBe('shot.jpg');
    expect(document.body.contains(clicked[0])).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:exposure');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
