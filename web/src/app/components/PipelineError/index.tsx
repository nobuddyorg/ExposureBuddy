'use client';

import { useId, useState } from 'react';

import type { PipelineFailure } from '../../exposure/failure';
import { useI18n } from '../../i18n/useI18n';
import { buttonClasses } from '../ui/buttonClasses';
import { cardClasses } from '../ui/cardClasses';
import { failureMessage } from './failureMessage';

export interface PipelineErrorProps {
  failure: PipelineFailure;
  /** Back to the picker, the photos still picked. */
  onRetry: () => void;
  /** The plain-text report the visitor may copy into a bug report (exposure/diagnostics.ts). */
  diagnostics: string;
}

type CopyStatus = 'idle' | 'copied' | 'failed';

/** The screen a failed run ends on: what went wrong, in the visitor's words, and the way back. */
export default function PipelineError({
  failure,
  onRetry,
  diagnostics,
}: PipelineErrorProps) {
  const { t, tCount } = useI18n();
  const hintId = useId();
  const [copy, setCopy] = useState<CopyStatus>('idle');

  // No clipboard outside a secure context, or a refused permission: both throw, and the text stays there to copy by hand.
  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

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
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          data-testid="copy-diagnostics"
          onClick={() => void copyDiagnostics()}
          className={buttonClasses({
            variant: 'secondary',
            className: 'w-full sm:w-auto',
          })}
        >
          {t('errors.copy_diagnostics')}
        </button>
        <button
          type="button"
          data-testid="retry"
          onClick={onRetry}
          className={buttonClasses({ className: 'w-full sm:w-auto' })}
        >
          {t('errors.retry')}
        </button>
      </div>
      <p
        role="status"
        data-testid="copy-status"
        className="text-sm text-muted-foreground"
      >
        {copy === 'copied' && t('errors.copied')}
        {copy === 'failed' && t('errors.copy_failed')}
      </p>
      <details data-testid="diagnostics" className="text-sm">
        <summary
          data-testid="diagnostics-toggle"
          className="cursor-pointer text-muted-foreground"
        >
          {t('errors.diagnostics_title')}
        </summary>
        <p id={hintId} className="mt-2 text-muted-foreground">
          {t('errors.diagnostics_hint')}
        </p>
        <pre
          data-testid="diagnostics-text"
          aria-describedby={hintId}
          className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs"
        >
          {diagnostics}
        </pre>
      </details>
    </div>
  );
}
