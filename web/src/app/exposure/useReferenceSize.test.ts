// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PickedPhoto } from './pickedPhotos';
import {
  readImageSize,
  useReferenceSize,
  type ReferenceSize,
} from './useReferenceSize';

function photo(id: string): PickedPhoto {
  return { id, file: new File([id], `${id}.jpg`, { type: 'image/jpeg' }) };
}

const SIZE = { width: 4032, height: 3024 };

describe('useReferenceSize', () => {
  it('knows nothing without a reference photo and reads nothing', () => {
    const read = vi.fn(() => Promise.resolve(SIZE));
    const { result } = renderHook(() => useReferenceSize(undefined, read));
    expect(result.current).toEqual({ kind: 'none' });
    expect(read).not.toHaveBeenCalled();
  });

  it('reads the reference photo once', async () => {
    const reference = photo('b');
    const read = vi.fn(() => Promise.resolve(SIZE));
    const { result, rerender } = renderHook(() =>
      useReferenceSize(reference, read),
    );
    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'known', size: SIZE }),
    );
    rerender();
    expect(read).toHaveBeenCalledExactlyOnceWith(reference.file);
  });

  it('reports a photo the browser cannot read', async () => {
    const read = vi.fn(() => Promise.reject(new Error('no')));
    const reference = photo('a');
    const { result } = renderHook(() => useReferenceSize(reference, read));
    await waitFor(() => expect(result.current).toEqual({ kind: 'unreadable' }));
  });

  it('forgets the old size the moment the reference photo changes', async () => {
    const read = vi.fn((file: Blob) =>
      file.size === 1
        ? Promise.resolve(SIZE)
        : new Promise<typeof SIZE>(() => {}),
    );
    const { result, rerender } = renderHook(
      ({ reference }) => useReferenceSize(reference, read),
      { initialProps: { reference: photo('a') } },
    );
    await waitFor(() => expect(result.current.kind).toBe('known'));
    rerender({ reference: photo('bb') });
    expect(result.current).toEqual({ kind: 'none' });
  });

  it('keeps the newer reference when an older one answers late', async () => {
    const answers: {
      resolve: (size: typeof SIZE) => void;
      reject: (error: Error) => void;
    }[] = [];
    const read = vi.fn(
      () =>
        new Promise<typeof SIZE>((resolve, reject) =>
          answers.push({ resolve, reject }),
        ),
    );
    const { result, rerender } = renderHook(
      ({ reference }) => useReferenceSize(reference, read),
      { initialProps: { reference: photo('a') } },
    );
    rerender({ reference: photo('b') });
    const newer = { width: 10, height: 20 };
    answers[1].resolve(newer);
    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'known', size: newer }),
    );
    await act(async () => answers[0].resolve(SIZE));
    expect(result.current).toEqual({ kind: 'known', size: newer });
  });

  it('keeps the newer reference when an older one fails late', async () => {
    const answers: { reject: (error: Error) => void }[] = [];
    const read = vi
      .fn<(file: Blob) => Promise<typeof SIZE>>()
      .mockImplementationOnce(
        () => new Promise((_, reject) => answers.push({ reject })),
      )
      .mockImplementationOnce(() => Promise.resolve(SIZE));
    const { result, rerender } = renderHook(
      ({ reference }) => useReferenceSize(reference, read),
      { initialProps: { reference: photo('a') } },
    );
    rerender({ reference: photo('b') });
    await waitFor(() => expect(result.current.kind).toBe('known'));
    await act(async () => answers[0].reject(new Error('late')));
    expect(result.current).toEqual({ kind: 'known', size: SIZE });
  });

  it('knows nothing again once the photos are cleared', async () => {
    const read = vi.fn(() => Promise.resolve(SIZE));
    const { result, rerender } = renderHook<
      ReferenceSize,
      { reference: PickedPhoto | undefined }
    >(({ reference }) => useReferenceSize(reference, read), {
      initialProps: { reference: photo('a') },
    });
    await waitFor(() => expect(result.current.kind).toBe('known'));
    rerender({ reference: undefined });
    expect(result.current).toEqual({ kind: 'none' });
  });
});

describe('readImageSize', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubImage(decode: () => Promise<void>) {
    const images: { src: string }[] = [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = 3024;
        naturalHeight = 4032;
        decode = decode;
        constructor() {
          images.push(this);
        }
      },
    );
    const revoke = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:photo',
      revokeObjectURL: revoke,
    });
    return { images, revoke };
  }

  it('decodes the file and answers its natural size, then lets the URL go', async () => {
    const { images, revoke } = stubImage(() => Promise.resolve());
    await expect(readImageSize(new Blob(['x']))).resolves.toEqual({
      width: 3024,
      height: 4032,
    });
    expect(images[0].src).toBe('blob:photo');
    expect(revoke).toHaveBeenCalledWith('blob:photo');
  });

  it('lets the URL go when decoding fails too', async () => {
    const { revoke } = stubImage(() => Promise.reject(new Error('broken')));
    await expect(readImageSize(new Blob(['x']))).rejects.toThrow('broken');
    expect(revoke).toHaveBeenCalledWith('blob:photo');
  });
});
