'use client';

import { useId } from 'react';

import type { SingleProgress as Progress } from '../../exposure/runSingle';
import { useI18n } from '../../i18n/useI18n';
import { buttonClasses } from '../ui/buttonClasses';
import { cardClasses } from '../ui/cardClasses';
import { singleCount, singlePercent, singleStageLabel } from './labels';

export interface SingleProgressProps {
  progress: Progress;
  onCancel: () => void;
}

/** The screen shown while one photo is read and its people found: the stage, one bar, and the way out. */
export default function SingleProgress({
  progress,
  onCancel,
}: SingleProgressProps) {
  const { t } = useI18n();
  const titleId = useId();
  const stage = singleStageLabel(t, progress.stage);
  const count = singleCount(t, progress);
  const percent = singlePercent(progress);

  return (
    <section
      data-testid="progress"
      aria-labelledby={titleId}
      className={cardClasses(
        'fade-up mx-auto flex max-w-3xl flex-col gap-6 p-5 sm:p-8',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <h1 id={titleId} className="font-display text-2xl font-semibold">
          {t('progress.single_title')}
        </h1>
        <span
          aria-hidden="true"
          className="mt-1 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-control-border border-t-accent"
        />
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p data-testid="progress-stage" className="font-medium">
            {stage}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">{count}</p>
        </div>
        <div
          role="progressbar"
          data-testid="progress-bar"
          aria-label={stage}
          aria-valuemin={0}
          aria-valuenow={percent}
          aria-valuemax={100}
          aria-valuetext={count === '' ? stage : `${stage}: ${count}`}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          data-testid="cancel"
          onClick={onCancel}
          className={buttonClasses({
            variant: 'secondary',
            className: 'w-full sm:w-auto',
          })}
        >
          {t('progress.cancel')}
        </button>
      </div>
    </section>
  );
}
