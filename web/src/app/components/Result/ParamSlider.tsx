'use client';

import { useId } from 'react';

import { labelClasses, rangeClasses } from '../ui/fieldClasses';

export interface ParamSliderProps {
  testId: string;
  label: string;
  help: string;
  /** Shown after the number, as in `4 px`. */
  unit: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

/** One labelled range input with its current value beside the label and its help text as the description. */
export function ParamSlider({
  testId,
  label,
  help,
  unit,
  value,
  max,
  disabled,
  onChange,
}: ParamSliderProps) {
  const id = useId();
  const helpId = `${id}-help`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={labelClasses()}>
          {label}
        </label>
        <output
          htmlFor={id}
          className="text-sm font-medium tabular-nums text-foreground"
        >
          {value} {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        data-testid={testId}
        aria-describedby={helpId}
        onChange={(event) => onChange(Number(event.target.value))}
        className={rangeClasses()}
      />
      <p id={helpId} className="text-xs text-muted-foreground">
        {help}
      </p>
    </div>
  );
}
