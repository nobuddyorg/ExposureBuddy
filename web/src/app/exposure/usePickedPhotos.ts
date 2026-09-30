'use client';

import { useCallback, useRef, useState } from 'react';

import {
  acceptPhotos,
  referencePosition,
  toPickerNotice,
  type PickedPhoto,
  type PickerNotice,
} from './pickedPhotos';

export interface PickedPhotos {
  readonly photos: readonly PickedPhoto[];
  /** Where in `photos` the one the others align to sits; −1 while there are none. */
  readonly reference: number;
  /** What the last `add` had to leave out, until the next `add` or `clear`. */
  readonly notice: PickerNotice | null;
  add: (files: readonly File[]) => void;
  remove: (id: string) => void;
  chooseReference: (id: string) => void;
  clear: () => void;
}

interface PickedState {
  readonly photos: readonly PickedPhoto[];
  /** The id of the photo chosen as the reference; empty, which no photo has, until one is. */
  readonly chosenReference: string;
  readonly notice: PickerNotice | null;
}

const EMPTY: PickedState = {
  photos: [],
  chosenReference: '',
  notice: null,
};

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
      return {
        ...current,
        photos: accepted.photos,
        notice: toPickerNotice(accepted),
      };
    });
  }, []);

  // A removed reference needs no reset: referencePosition falls back to the middle.
  const remove = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      photos: current.photos.filter((photo) => photo.id !== id),
    }));
  }, []);

  const chooseReference = useCallback((id: string) => {
    setState((current) => ({ ...current, chosenReference: id }));
  }, []);

  const clear = useCallback(() => setState(EMPTY), []);

  return {
    photos: state.photos,
    reference: referencePosition(state.photos, state.chosenReference),
    notice: state.notice,
    add,
    remove,
    chooseReference,
    clear,
  };
}
