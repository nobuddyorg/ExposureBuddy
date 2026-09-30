'use client';

import { useEffect, useState } from 'react';

import type { Size } from '../vision/types';
import type { PickedPhoto } from './pickedPhotos';
import { referenceIndex } from './runPipeline';

export type ReferenceSize =
  | { readonly kind: 'none' }
  | { readonly kind: 'known'; readonly size: Size }
  | { readonly kind: 'unreadable' };

export type ImageSizeReader = (file: Blob) => Promise<Size>;

/** The dimensions of `file` as the browser shows it, EXIF rotation applied; one decode, off the main thread where the engine can. */
export async function readImageSize(file: Blob): Promise<Size> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const NONE: ReferenceSize = { kind: 'none' };

interface Measured {
  readonly photo: PickedPhoto | undefined;
  readonly size: ReferenceSize;
}

/** The size of the photo the pipeline will align to, read once per reference photo, so the picker can say what will come out. */
export function useReferenceSize(
  photos: readonly PickedPhoto[],
  read: ImageSizeReader = readImageSize,
): ReferenceSize {
  // Empty: referenceIndex(0) is −1, which `at` answers with undefined.
  const reference = photos.at(referenceIndex(photos.length));
  const [measured, setMeasured] = useState<Measured>({
    photo: undefined,
    size: NONE,
  });

  useEffect(() => {
    if (!reference) return;
    let current = true;
    read(reference.file).then(
      (size) => {
        if (current)
          setMeasured({ photo: reference, size: { kind: 'known', size } });
      },
      () => {
        if (current)
          setMeasured({ photo: reference, size: { kind: 'unreadable' } });
      },
    );
    // A slower answer for an earlier reference must not overwrite a newer one.
    return () => {
      current = false;
    };
  }, [reference, read]);

  // A result for an earlier reference photo says nothing about this one.
  return measured.photo === reference ? measured.size : NONE;
}
