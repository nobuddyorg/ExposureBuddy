'use client';

import { useId } from 'react';

import type { PipelineProgress } from '../../exposure/runPipeline';
import { useI18n } from '../../i18n/useI18n';
import { buttonClasses } from '../ui/buttonClasses';
import { cardClasses } from '../ui/cardClasses';
import { FrameChip } from './FrameChip';
import { percentDone, stageLabel } from './labels';

export interface ProgressProps {
  progress: PipelineProgress;
  onCancel: () => void;
}

/** The screen shown while the pipeline runs: the stage, a bar, one chip per photo, and the way out. */
export default function Progress({ progress, onCancel }: ProgressProps) {
  const { t } = useI18n();
  const titleId = useId();
  const stage = stageLabel(t, progress.stage);
  const count = t('progress.count', {
    done: progress.done,
    total: progress.total,
  });

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
          {t('progress.title')}
        </h1>
        <span
          aria-hidden="true"
          className="mt-1 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-control-border border-t-accent"
        />
      </div>

      {/* Polite, on the stage line only: each frame's chip changing would otherwise be read out too. */}
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
          aria-valuenow={progress.done}
          aria-valuemax={progress.total}
          aria-valuetext={count}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${percentDone(progress.done, progress.total)}%` }}
          />
        </div>
      </div>

      {progress.frames.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {progress.frames.map((frame) => (
            <FrameChip key={frame.index} frame={frame} />
          ))}
        </ul>
      )}

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
