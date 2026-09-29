import { describe, expect, it } from 'vitest';

import {
  acceptPhotos,
  isImageFile,
  MAX_PHOTOS,
  toPickerNotice,
  type PickedPhoto,
} from './pickedPhotos';

function image(
  name: string,
  options: { size?: number; modified?: number } = {},
) {
  const bytes = new Uint8Array(options.size ?? 3);
  return new File([bytes], name, {
    type: 'image/jpeg',
    lastModified: options.modified ?? 1_000,
  });
}

function counter() {
  let last = 0;
  return () => {
    last += 1;
    return String(last);
  };
}

describe('isImageFile', () => {
  it('accepts any image/* type', () => {
    expect(isImageFile(new File([], 'a', { type: 'image/heic' }))).toBe(true);
    expect(isImageFile(new File([], 'a', { type: 'image/png' }))).toBe(true);
  });

  it('refuses a typed non-image, whatever its name', () => {
    expect(isImageFile(new File([], 'a.jpg', { type: 'text/plain' }))).toBe(
      false,
    );
  });

  it.each(['a.jpg', 'a.JPEG', 'a.png', 'a.webp', 'a.heic', 'a.heif', 'a.avif'])(
    'accepts %s when the browser reported no type',
    (name) => {
      expect(isImageFile(new File([], name, { type: '' }))).toBe(true);
    },
  );

  it('refuses an untyped file whose image extension is not its last one', () => {
    expect(isImageFile(new File([], 'a.jpg.txt', { type: '' }))).toBe(false);
  });

  it('refuses an untyped file with another extension', () => {
    expect(isImageFile(new File([], 'notes.txt', { type: '' }))).toBe(false);
    expect(isImageFile(new File([], 'jpg', { type: '' }))).toBe(false);
  });
});

describe('acceptPhotos', () => {
  it('appends images in order with fresh ids', () => {
    const files = [image('a.jpg'), image('b.jpg')];
    const result = acceptPhotos([], files, counter());
    expect(result.photos.map((photo) => photo.id)).toEqual(['1', '2']);
    expect(result.photos.map((photo) => photo.file)).toEqual(files);
    expect(result).toMatchObject({ refused: [], truncated: false });
  });

  it('keeps what was there and appends after it', () => {
    const current: PickedPhoto[] = [{ id: 'x', file: image('a.jpg') }];
    const result = acceptPhotos(current, [image('b.jpg')], counter());
    expect(result.photos.map((photo) => photo.file.name)).toEqual([
      'a.jpg',
      'b.jpg',
    ]);
    expect(result.photos[0]).toBe(current[0]);
    expect(current).toHaveLength(1);
  });

  it('names the files that are not images and leaves them out', () => {
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const result = acceptPhotos([], [text, image('a.jpg')], counter());
    expect(result.refused).toEqual(['notes.txt']);
    expect(result.photos.map((photo) => photo.file.name)).toEqual(['a.jpg']);
  });

  it('drops a file already picked, by name, size and last-modified', () => {
    const current = acceptPhotos([], [image('a.jpg')], counter()).photos;
    const result = acceptPhotos(
      current,
      [image('a.jpg'), image('a.jpg'), image('a.jpg', { size: 4 })],
      counter(),
    );
    expect(result.photos).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it('tells a same-named file apart by its last-modified time', () => {
    const result = acceptPhotos(
      [],
      [image('a.jpg', { modified: 1 }), image('a.jpg', { modified: 2 })],
      counter(),
    );
    expect(result.photos).toHaveLength(2);
  });

  it('stops at MAX_PHOTOS and reports the cut', () => {
    const files = Array.from({ length: MAX_PHOTOS + 1 }, (_, index) =>
      image(`${index}.jpg`),
    );
    const result = acceptPhotos([], files, counter());
    expect(result.photos).toHaveLength(MAX_PHOTOS);
    expect(result.truncated).toBe(true);
    expect(result.photos.at(-1)?.file.name).toBe(`${MAX_PHOTOS - 1}.jpg`);
  });

  it('is not truncated at exactly MAX_PHOTOS', () => {
    const files = Array.from({ length: MAX_PHOTOS }, (_, index) =>
      image(`${index}.jpg`),
    );
    expect(acceptPhotos([], files, counter()).truncated).toBe(false);
  });

  it('counts a refused file after the cap as refused, not as overflow', () => {
    const files = Array.from({ length: MAX_PHOTOS }, (_, index) =>
      image(`${index}.jpg`),
    );
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const result = acceptPhotos([], [...files, text], counter());
    expect(result.truncated).toBe(false);
    expect(result.refused).toEqual(['notes.txt']);
  });

  it('does not let a duplicate past the cap count as overflow', () => {
    const files = Array.from({ length: MAX_PHOTOS }, (_, index) =>
      image(`${index}.jpg`),
    );
    const result = acceptPhotos([], [...files, image('0.jpg')], counter());
    expect(result.truncated).toBe(false);
  });
});

describe('toPickerNotice', () => {
  it('is null when everything was accepted', () => {
    expect(
      toPickerNotice({ photos: [], refused: [], truncated: false }),
    ).toBeNull();
  });

  it('names the refused files', () => {
    expect(
      toPickerNotice({ photos: [], refused: ['a.txt'], truncated: true }),
    ).toEqual({ kind: 'refused', names: ['a.txt'] });
  });

  it('reports the cap when nothing was refused', () => {
    expect(
      toPickerNotice({ photos: [], refused: [], truncated: true }),
    ).toEqual({ kind: 'truncated', limit: MAX_PHOTOS });
  });
});
