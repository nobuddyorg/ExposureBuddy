'use client';

import { useI18n } from '../../i18n/useI18n';
import { buttonClasses } from '../ui/buttonClasses';

export interface ActionRowProps {
  shareSupported: boolean;
  /** The canvas shows the single photo while comparing; exporting it as the result would mislead. */
  comparing: boolean;
  onDownload: () => void;
  onShare: () => void;
  onStartOver: () => void;
}

/** Save and, where the browser can, share, with a quiet way back to the picker. */
export function ActionRow({
  shareSupported,
  comparing,
  onDownload,
  onShare,
  onStartOver,
}: ActionRowProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        data-testid="download"
        onClick={onDownload}
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
        data-testid="start-over"
        onClick={onStartOver}
        className={buttonClasses({ variant: 'ghost', className: 'shrink-0' })}
      >
        {t('result.start_over')}
      </button>
    </div>
  );
}
