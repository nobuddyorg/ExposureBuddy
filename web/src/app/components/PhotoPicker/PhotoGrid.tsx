'use client';

import type { PickedPhoto } from '../../exposure/pickedPhotos';
import { useI18n } from '../../i18n/useI18n';
import { useObjectUrl } from './useObjectUrl';

function Thumbnail({ photo, index }: { photo: PickedPhoto; index: number }) {
  const { t } = useI18n();
  const url = useObjectUrl(photo.file);

  return (
    <li className="aspect-square overflow-hidden rounded-lg bg-muted ring-1 ring-border">
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
    </li>
  );
}

/** The picked burst as square tiles, four across on a phone, more on wider screens. */
export function PhotoGrid({ photos }: { photos: readonly PickedPhoto[] }) {
  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
      {photos.map((photo, position) => (
        <Thumbnail key={photo.id} photo={photo} index={position + 1} />
      ))}
    </ul>
  );
}
