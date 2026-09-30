'use client';

import { useEffect, useRef } from 'react';

import type { PickedPhoto } from '../../exposure/pickedPhotos';
import { useI18n } from '../../i18n/useI18n';
import { Icon } from '../ui/Icon';
import { useObjectUrl } from './useObjectUrl';

interface PhotoGridProps {
  photos: readonly PickedPhoto[];
  /** Where in `photos` the one the others align to sits. */
  reference: number;
  onRemove: (id: string) => void;
  onChooseReference: (id: string) => void;
}

interface ThumbnailProps {
  photo: PickedPhoto;
  index: number;
  isReference: boolean;
  onRemove: () => void;
  onChooseReference: () => void;
}

function Thumbnail({
  photo,
  index,
  isReference,
  onRemove,
  onChooseReference,
}: ThumbnailProps) {
  const { t } = useI18n();
  const url = useObjectUrl(photo.file);

  return (
    <li
      data-testid="photo-tile"
      data-reference={isReference}
      className={`relative aspect-square overflow-hidden rounded-lg bg-muted ${
        isReference ? 'ring-2 ring-accent' : 'ring-1 ring-border'
      }`}
    >
      <button
        type="button"
        data-testid="choose-reference"
        aria-pressed={isReference}
        aria-label={t('picker.use_as_reference', { index })}
        onClick={onChooseReference}
        // The tile clips its content, so the focus ring goes inside.
        className="block h-full w-full focus-visible:-outline-offset-2"
      >
        {url !== '' && (
          // eslint-disable-next-line @next/next/no-img-element -- a blob: URL of a local file; next/image has nothing to optimise
          <img
            data-testid="photo-thumb"
            src={url}
            alt={t('picker.thumbnail_alt', { index })}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
      </button>
      {isReference && (
        <span
          data-testid="reference-badge"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
        >
          {t('picker.reference')}
        </span>
      )}
      <button
        type="button"
        data-testid="remove-photo"
        aria-label={t('picker.remove', { index })}
        onClick={onRemove}
        className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:-outline-offset-2"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </li>
  );
}

/** The picked burst as square tiles, four across on a phone, more on wider screens; a tile is removed or made the reference here. */
export function PhotoGrid({
  photos,
  reference,
  onRemove,
  onChooseReference,
}: PhotoGridProps) {
  const list = useRef<HTMLUListElement>(null);
  // The remove button that had focus is gone with its tile; the one now in its place takes over.
  const refocusAt = useRef<number | null>(null);

  useEffect(() => {
    const position = refocusAt.current;
    if (position === null) return;
    refocusAt.current = null;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>(
      '[data-testid="remove-photo"]',
    );
    buttons?.item(Math.min(position, buttons.length - 1))?.focus();
  }, [photos]);

  return (
    <ul
      ref={list}
      className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8"
    >
      {photos.map((photo, position) => (
        <Thumbnail
          key={photo.id}
          photo={photo}
          index={position + 1}
          isReference={position === reference}
          onRemove={() => {
            refocusAt.current = position;
            onRemove(photo.id);
          }}
          onChooseReference={() => onChooseReference(photo.id)}
        />
      ))}
    </ul>
  );
}
