'use client';

import { useId } from 'react';

import { useI18n } from '../../i18n/useI18n';

export interface TrailsSwitchProps {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/** The light-trails switch: a checkbox announced as a switch, its label beside it and a line on what it does below. */
export function TrailsSwitch({
  checked,
  disabled,
  onChange,
}: TrailsSwitchProps) {
  const { t } = useI18n();
  const id = useId();

  return (
    <div className="space-y-1 pb-2">
      <div className="flex min-h-11 items-center gap-3">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          data-testid="trails-toggle"
          aria-describedby={`${id}-help`}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-accent"
        />
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {t('result.trails')}
        </label>
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {t('result.trails_help')}
      </p>
    </div>
  );
}
