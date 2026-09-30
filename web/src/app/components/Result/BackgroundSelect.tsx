'use client';

import { useId } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { BACKGROUND_MODES, type BackgroundMode } from '../../vision/types';
import { fieldClasses, labelClasses } from '../ui/fieldClasses';

export interface BackgroundSelectProps {
  value: BackgroundMode;
  disabled: boolean;
  onChange: (mode: BackgroundMode) => void;
}

/** The dropdown that picks how the static scene is estimated, with a line on what the chosen one does. */
export function BackgroundSelect({
  value,
  disabled,
  onChange,
}: BackgroundSelectProps) {
  const { t } = useI18n();
  const id = useId();
  // Spelled out per mode: the i18n parity test only credits literal t('…') keys.
  const names: Record<BackgroundMode, string> = {
    median: t('result.background_median'),
    trimmed: t('result.background_trimmed'),
    clipped: t('result.background_clipped'),
    mode: t('result.background_mode'),
  };
  const helps: Record<BackgroundMode, string> = {
    median: t('result.background_median_help'),
    trimmed: t('result.background_trimmed_help'),
    clipped: t('result.background_clipped_help'),
    mode: t('result.background_mode_help'),
  };

  return (
    <div className="space-y-1 pb-2">
      <label htmlFor={id} className={labelClasses()}>
        {t('result.background')}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        data-testid="background-select"
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(event.target.value as BackgroundMode)}
        className={fieldClasses()}
      >
        {BACKGROUND_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {names[mode]}
          </option>
        ))}
      </select>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {helps[value]}
      </p>
    </div>
  );
}
