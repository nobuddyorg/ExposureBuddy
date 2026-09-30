// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withShotDate, type ShotDate } from './exifDate';
import type { PickedPhoto } from './pickedPhotos';
import { readShotDateOf, useShotDate } from './useShotDate';

const WHEN: ShotDate = { kind: 'dated', timestamp: '2026:09:28 14:32:05' };

function photo(id: string): PickedPhoto {
  return { id, file: new File([id], `${id}.jpg`, { type: 'image/jpeg' }) };
}

describe('readShotDateOf', () => {
  it('reads the date from the head of a JPEG file', async () => {
    const jpeg = withShotDate(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), WHEN);
    await expect(readShotDateOf(new Blob([jpeg]))).resolves.toEqual(WHEN);
  });

  it('reads only the head of the file', async () => {
    const jpeg = withShotDate(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), WHEN);
    const slice = vi.fn(() => new Blob([jpeg]));
    const file = {
      slice,
      arrayBuffer: () => Promise.reject(new Error('the whole file was read')),
    } as unknown as Blob;
    await expect(readShotDateOf(file)).resolves.toEqual(WHEN);
    expect(slice).toHaveBeenCalledWith(0, 256 * 1024);
  });

  it('is undated for a file without EXIF', async () => {
    await expect(readShotDateOf(new Blob(['text']))).resolves.toEqual({
      kind: 'undated',
    });
  });
});

describe('useShotDate', () => {
  it('is undated without a photo and reads nothing', () => {
    const read = vi.fn(() => Promise.resolve(WHEN));
    const { result } = renderHook(() => useShotDate(undefined, read));
    expect(result.current).toEqual({ kind: 'undated' });
    expect(read).not.toHaveBeenCalled();
  });

  it('answers the date the photo was taken', async () => {
    const reference = photo('a');
    const read = vi.fn(() => Promise.resolve(WHEN));
    const { result } = renderHook(() => useShotDate(reference, read));
    await waitFor(() => expect(result.current).toEqual(WHEN));
    expect(read).toHaveBeenCalledExactlyOnceWith(reference.file);
  });

  it('stays undated when the file cannot be read', async () => {
    const reference = photo('a');
    const read = vi.fn(() => Promise.reject(new Error('gone')));
    const { result } = renderHook(() => useShotDate(reference, read));
    await act(async () => {});
    expect(result.current).toEqual({ kind: 'undated' });
  });

  it('keeps the newer photo’s date when an older one answers late', async () => {
    const answers: ((date: ShotDate) => void)[] = [];
    const read = vi.fn(
      () => new Promise<ShotDate>((resolve) => answers.push(resolve)),
    );
    const { result, rerender } = renderHook(
      ({ reference }) => useShotDate(reference, read),
      { initialProps: { reference: photo('a') } },
    );
    rerender({ reference: photo('b') });
    const newer: ShotDate = { kind: 'dated', timestamp: '2027:01:01 00:00:00' };
    await act(async () => answers[1](newer));
    expect(result.current).toEqual(newer);
    await act(async () => answers[0](WHEN));
    expect(result.current).toEqual(newer);
  });

  it('forgets the date once the photo is gone', async () => {
    const read = vi.fn(() => Promise.resolve(WHEN));
    const { result, rerender } = renderHook<
      ShotDate,
      { reference: PickedPhoto | undefined }
    >(({ reference }) => useShotDate(reference, read), {
      initialProps: { reference: photo('a') },
    });
    await waitFor(() => expect(result.current).toEqual(WHEN));
    rerender({ reference: undefined });
    expect(result.current).toEqual({ kind: 'undated' });
  });
});
