'use client';

import { useId } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { EFFECTS, type EffectName } from '../../vision/effects/effectParams';
import { fieldClasses, labelClasses } from '../ui/fieldClasses';
import { effectLabels } from './labels';

export interface EffectSelectProps {
  value: EffectName;
  disabled: boolean;
  onChange: (effect: EffectName) => void;
}

/** The dropdown that picks what the people turn into, with a line on what the chosen one does. */
export function EffectSelect({ value, disabled, onChange }: EffectSelectProps) {
  const { t } = useI18n();
  const id = useId();

  return (
    <div className="space-y-1 pb-2">
      <label htmlFor={id} className={labelClasses()}>
        {t('single.effect')}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        data-testid="effect-select"
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(event.target.value as EffectName)}
        className={fieldClasses()}
      >
        {EFFECTS.map((effect) => (
          <option key={effect} value={effect}>
            {effectLabels(t, effect).name}
          </option>
        ))}
      </select>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {effectLabels(t, value).help}
      </p>
    </div>
  );
}
