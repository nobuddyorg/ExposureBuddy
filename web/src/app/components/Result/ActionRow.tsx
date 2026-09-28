'use client';

import { useI18n } from '../../i18n/useI18n';
import { buttonClasses } from '../ui/buttonClasses';

export interface ActionRowProps {
  shareSupported: boolean;
  comparing: boolean;
  onDownload: () => void;
  onShare: () => void;
  onToggleCompare: () => void;
  onStartOver: () => void;
}

/** Save, share (where the browser can), compare and start over, wrapping onto as many lines as needed. */
export function ActionRow({
  shareSupported,
  comparing,
  onDownload,
  onShare,
  onToggleCompare,
  onStartOver,
}: ActionRowProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="download"
        onClick={onDownload}
        // The canvas shows the single photo while comparing; exporting it as the result would mislead.
        disabled={comparing}
        className={buttonClasses({ className: 'grow basis-40' })}
      >
        {t('result.download')}
      </button>
      {shareSupported && (
        <button
          type="button"
          data-testid="share"
          onClick={onShare}
          disabled={comparing}
          className={buttonClasses({
            variant: 'secondary',
            className: 'grow basis-32',
          })}
        >
          {t('result.share')}
        </button>
      )}
      <button
        type="button"
        data-testid="compare-toggle"
        aria-pressed={comparing}
        onClick={onToggleCompare}
        className={buttonClasses({
          variant: 'secondary',
          className: `grow basis-full ${comparing ? 'ring-2 ring-accent' : ''}`,
        })}
      >
        {t('result.compare')}
      </button>
      <button
        type="button"
        data-testid="start-over"
        onClick={onStartOver}
        className={buttonClasses({
          variant: 'ghost',
          className: 'grow basis-full',
        })}
      >
        {t('result.start_over')}
      </button>
    </div>
  );
}
