'use client';

import type { PickerNotice as Notice } from '../../exposure/pickedPhotos';
import { useI18n } from '../../i18n/useI18n';

/**
 * The status region for what the picker had to say no to. Always mounted, so a screen reader is
 * already listening when text arrives; visually hidden while there is nothing to say.
 */
export function PickerNotice({
  notice,
  unsupported,
}: {
  notice: Notice | null;
  unsupported: boolean;
}) {
  const { t } = useI18n();
  const hasContent = unsupported || notice !== null;

  return (
    <div
      role="status"
      data-testid="picker-notice"
      className={
        hasContent
          ? 'space-y-1 rounded-lg bg-muted px-4 py-3 text-sm ring-1 ring-inset ring-control-border'
          : 'sr-only'
      }
    >
      {unsupported && <p>{t('picker.unsupported')}</p>}
      {notice?.kind === 'refused' && (
        <ul className="space-y-1">
          {notice.names.map((name, position) => (
            // Two folders can hold a same-named file, so the name alone is no key.
            <li key={`${position}:${name}`} className="break-words">
              {t('picker.not_image', { name })}
            </li>
          ))}
        </ul>
      )}
      {notice?.kind === 'truncated' && (
        <p>{t('picker.too_many', { count: notice.limit })}</p>
      )}
    </div>
  );
}
