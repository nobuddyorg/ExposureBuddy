'use client';

import type { PipelineFailure } from '../../exposure/failure';
import { useI18n } from '../../i18n/useI18n';
import { buttonClasses } from '../ui/buttonClasses';
import { cardClasses } from '../ui/cardClasses';
import { failureMessage } from './failureMessage';

export interface PipelineErrorProps {
  failure: PipelineFailure;
  /** Back to the picker, the photos still picked. */
  onRetry: () => void;
}

/** The screen a failed run ends on: what went wrong, in the visitor's words, and the way back. */
export default function PipelineError({
  failure,
  onRetry,
}: PipelineErrorProps) {
  const { t, tCount } = useI18n();

  return (
    <div
      role="alert"
      data-testid="pipeline-error"
      className={cardClasses(
        'fade-up mx-auto flex max-w-xl flex-col gap-5 p-5 sm:p-8',
      )}
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="font-display grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-lg font-semibold text-accent"
        >
          !
        </span>
        <div className="min-w-0 space-y-2">
          <h1 className="font-display text-2xl font-semibold">
            {t('errors.title')}
          </h1>
          <p className="break-words text-muted-foreground">
            {failureMessage(t, tCount, failure)}
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="retry"
          onClick={onRetry}
          className={buttonClasses({ className: 'w-full sm:w-auto' })}
        >
          {t('errors.retry')}
        </button>
      </div>
    </div>
  );
}
