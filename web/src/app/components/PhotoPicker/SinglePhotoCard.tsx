'use client';

import { useId } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { buttonClasses } from '../ui/buttonClasses';
import { cardClasses } from '../ui/cardClasses';

export interface SinglePhotoCardProps {
  unsupported: boolean;
  onStart: () => void;
}

/** Offered when exactly one photo is picked: a burst needs two, but one photo can still lose its people to an effect. */
export function SinglePhotoCard({
  unsupported,
  onStart,
}: SinglePhotoCardProps) {
  const { t } = useI18n();
  const titleId = useId();
  const noteId = useId();

  return (
    <section
      data-testid="single-photo-card"
      aria-labelledby={titleId}
      className={cardClasses('flex flex-col gap-3 p-4 sm:p-5')}
    >
      <h2 id={titleId} className="font-display text-lg font-semibold">
        {t('picker.single_title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('picker.single_body')}</p>
      <button
        type="button"
        data-testid="single-photo"
        disabled={unsupported}
        aria-describedby={noteId}
        onClick={onStart}
        className={buttonClasses({
          className: 'w-full sm:w-auto sm:self-start',
        })}
      >
        {t('picker.single_action')}
      </button>
      <p id={noteId} className="text-xs text-muted-foreground">
        {t('picker.single_note')}
      </p>
    </section>
  );
}
