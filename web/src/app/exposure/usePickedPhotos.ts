'use client';

import { useCallback, useRef, useState } from 'react';

import {
  acceptPhotos,
  toPickerNotice,
  type PickedPhoto,
  type PickerNotice,
} from './pickedPhotos';

export interface PickedPhotos {
  readonly photos: readonly PickedPhoto[];
  /** What the last `add` had to leave out, until the next `add` or `clear`. */
  readonly notice: PickerNotice | null;
  add: (files: readonly File[]) => void;
  clear: () => void;
}

interface PickedState {
  readonly photos: readonly PickedPhoto[];
  readonly notice: PickerNotice | null;
}

const EMPTY: PickedState = { photos: [], notice: null };

/** The burst as picked so far: images only, deduplicated, capped, with a notice for whatever was left out. */
export function usePickedPhotos(): PickedPhotos {
  const [state, setState] = useState<PickedState>(EMPTY);
  // Ids only need to be unique within one hook; skipped numbers (a re-run updater) are harmless.
  const lastId = useRef(0);

  const add = useCallback((files: readonly File[]) => {
    const nextId = () => {
      lastId.current += 1;
      return String(lastId.current);
    };
    setState((current) => {
      const accepted = acceptPhotos(current.photos, files, nextId);
      return { photos: accepted.photos, notice: toPickerNotice(accepted) };
    });
  }, []);

  const clear = useCallback(() => setState(EMPTY), []);

  return { photos: state.photos, notice: state.notice, add, clear };
}
