// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MAX_PHOTOS } from './pickedPhotos';
import { usePickedPhotos } from './usePickedPhotos';

function image(name: string) {
  return new File(['x'], name, { type: 'image/jpeg', lastModified: 1 });
}

describe('usePickedPhotos', () => {
  it('starts empty with no notice', () => {
    const { result } = renderHook(() => usePickedPhotos());
    expect(result.current.photos).toEqual([]);
    expect(result.current.notice).toBeNull();
  });

  it('adds images with unique ids across calls', () => {
    const { result } = renderHook(() => usePickedPhotos());
    act(() => result.current.add([image('a.jpg'), image('b.jpg')]));
    act(() => result.current.add([image('c.jpg')]));
    const ids = result.current.photos.map((photo) => photo.id);
    expect(new Set(ids).size).toBe(3);
    expect(result.current.photos.map((photo) => photo.file.name)).toEqual([
      'a.jpg',
      'b.jpg',
      'c.jpg',
    ]);
  });

  it('notices a refused file and forgets it on the next clean add', () => {
    const { result } = renderHook(() => usePickedPhotos());
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });
    act(() => result.current.add([text]));
    expect(result.current.notice).toEqual({
      kind: 'refused',
      names: ['notes.txt'],
    });
    expect(result.current.photos).toEqual([]);

    act(() => result.current.add([image('a.jpg')]));
    expect(result.current.notice).toBeNull();
  });

  it('notices the cap', () => {
    const { result } = renderHook(() => usePickedPhotos());
    const files = Array.from({ length: MAX_PHOTOS + 1 }, (_, index) =>
      image(`${index}.jpg`),
    );
    act(() => result.current.add(files));
    expect(result.current.photos).toHaveLength(MAX_PHOTOS);
    expect(result.current.notice).toEqual({
      kind: 'truncated',
      limit: MAX_PHOTOS,
    });
  });

  it('clears the photos and the notice', () => {
    const { result } = renderHook(() => usePickedPhotos());
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });
    act(() => result.current.add([image('a.jpg'), text]));
    act(() => result.current.clear());
    expect(result.current.photos).toEqual([]);
    expect(result.current.notice).toBeNull();
  });

  it('removes one photo, keeping the others and the notice', () => {
    const { result } = renderHook(() => usePickedPhotos());
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });
    act(() => result.current.add([image('a.jpg'), image('b.jpg'), text]));
    act(() => result.current.remove(result.current.photos[0].id));
    expect(result.current.photos.map((photo) => photo.file.name)).toEqual([
      'b.jpg',
    ]);
    expect(result.current.notice).toMatchObject({ kind: 'refused' });
  });

  it('aligns to the middle photo until another is chosen, and again once that one is removed', () => {
    const { result } = renderHook(() => usePickedPhotos());
    expect(result.current.reference).toBe(-1);
    act(() =>
      result.current.add(['a', 'b', 'c', 'd'].map((name) => image(name))),
    );
    expect(result.current.reference).toBe(1);
    const last = result.current.photos[3].id;
    act(() => result.current.chooseReference(last));
    expect(result.current.reference).toBe(3);
    // The choice follows the photo, not its position.
    act(() => result.current.remove(result.current.photos[0].id));
    expect(result.current.reference).toBe(2);
    act(() => result.current.add([image('e'), image('f')]));
    expect(result.current.reference).toBe(2);
    act(() => result.current.remove(last));
    expect(result.current.reference).toBe(1);
  });

  it('keeps its methods stable across renders', () => {
    const { result, rerender } = renderHook(() => usePickedPhotos());
    const { add, remove, chooseReference, clear } = result.current;
    act(() => add([image('a.jpg')]));
    rerender();
    expect(result.current.add).toBe(add);
    expect(result.current.remove).toBe(remove);
    expect(result.current.chooseReference).toBe(chooseReference);
    expect(result.current.clear).toBe(clear);
  });
});
