'use client';

import { useEffect, useState } from 'react';

import { readShotDate, type ShotDate } from './exifDate';
import type { PickedPhoto } from './pickedPhotos';

// EXIF sits in the first segments of a JPEG; a phone's is a few kilobytes, a camera's with a thumbnail well under this.
const HEADER_BYTES = 256 * 1024;
const UNDATED: ShotDate = { kind: 'undated' };

export type ShotDateReader = (file: Blob) => Promise<ShotDate>;

/** When `file` was taken, from the head of the file only; undated when it cannot be read or says nothing. */
export async function readShotDateOf(file: Blob): Promise<ShotDate> {
  const head = await file.slice(0, HEADER_BYTES).arrayBuffer();
  return readShotDate(new Uint8Array(head));
}

interface Read {
  readonly photo: PickedPhoto | undefined;
  readonly date: ShotDate;
}

/** When the reference photo was taken, so the saved result can carry the same date. */
export function useShotDate(
  photo: PickedPhoto | undefined,
  read: ShotDateReader = readShotDateOf,
): ShotDate {
  const [dated, setDated] = useState<Read>({ photo: undefined, date: UNDATED });

  useEffect(() => {
    if (!photo) return;
    let current = true;
    read(photo.file).then(
      (date) => {
        if (current) setDated({ photo, date });
      },
      // A file the browser cannot read has no date to give; saving goes on without one.
      () => {},
    );
    return () => {
      current = false;
    };
  }, [photo, read]);

  return dated.photo === photo ? dated.date : UNDATED;
}
