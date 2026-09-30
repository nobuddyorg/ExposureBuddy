'use client';

import { useI18n } from '../../i18n/useI18n';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';

/** The toggle that swaps the result for one original photo; it sits on the corner of the image. */
export function CompareButton({
  pressed,
  onToggle,
}: {
  pressed: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();

  return (
    <IconButton
      data-testid="compare-toggle"
      variant="secondary"
      aria-label={t('result.compare')}
      title={t('result.compare')}
      aria-pressed={pressed}
      onClick={onToggle}
      className={`absolute right-2 bottom-2 bg-card/90 backdrop-blur ${pressed ? 'ring-2 ring-accent' : ''}`}
    >
      <Icon name="compare" />
    </IconButton>
  );
}
