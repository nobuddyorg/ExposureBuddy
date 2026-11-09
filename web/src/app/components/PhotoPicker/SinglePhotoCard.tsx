'use client';

import { useId, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import {
  DETECTION_DETAILS,
  type DetectionDetail,
} from '../../vision/effects/tiles';
import { fieldClasses, labelClasses } from '../ui/fieldClasses';
import { buttonClasses } from '../ui/buttonClasses';
import { cardClasses } from '../ui/cardClasses';

export interface SinglePhotoCardProps {
  unsupported: boolean;
  onStart: (detail: DetectionDetail) => void;
}

/** Offered when exactly one photo is picked: a burst needs two, but one photo can still lose its people to an effect. */
export function SinglePhotoCard({
  unsupported,
  onStart,
}: SinglePhotoCardProps) {
  const { t } = useI18n();
  const titleId = useId();
  const noteId = useId();
  const detailId = useId();
  const detailNames: Record<DetectionDetail, string> = {
    fast: t('picker.single_detail_fast'),
    thorough: t('picker.single_detail_thorough'),
  };
  const [detail, setDetail] = useState<DetectionDetail>('thorough');

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
      <div className="space-y-1">
        <label htmlFor={detailId} className={labelClasses()}>
          {t('picker.single_detail')}
        </label>
        <select
          id={detailId}
          value={detail}
          data-testid="detail-select"
          aria-describedby={`${detailId}-help`}
          onChange={(event) => setDetail(event.target.value as DetectionDetail)}
          className={fieldClasses()}
        >
          {DETECTION_DETAILS.map((value) => (
            <option key={value} value={value}>
              {detailNames[value]}
            </option>
          ))}
        </select>
        <p id={`${detailId}-help`} className="text-xs text-muted-foreground">
          {t('picker.single_detail_help')}
        </p>
      </div>
      <button
        type="button"
        data-testid="single-photo"
        disabled={unsupported}
        aria-describedby={noteId}
        onClick={() => onStart(detail)}
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
