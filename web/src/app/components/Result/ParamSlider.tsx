'use client';

import { useId, useState } from 'react';

import { Icon } from '../ui/Icon';
import { labelClasses, rangeClasses } from '../ui/fieldClasses';

export interface ParamSliderProps {
  testId: string;
  label: string;
  help: string;
  /** The accessible name of the button that shows the help text. */
  infoLabel: string;
  /** Shown after the number, as in `4 px`. */
  unit: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

/** One range input: its label, value and an info button on one line, the slider below, the help text on demand. */
export function ParamSlider({
  testId,
  label,
  help,
  infoLabel,
  unit,
  value,
  max,
  disabled,
  onChange,
}: ParamSliderProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const [helpShown, setHelpShown] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={labelClasses('grow')}>
          {label}
        </label>
        <output
          htmlFor={id}
          className="text-sm font-medium tabular-nums text-foreground"
        >
          {value} {unit}
        </output>
        <button
          type="button"
          aria-label={infoLabel}
          aria-expanded={helpShown}
          aria-controls={helpId}
          onClick={() => setHelpShown((shown) => !shown)}
          className="-my-1 -mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon name="info" className="h-4 w-4" />
        </button>
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
      <p
        id={helpId}
        hidden={!helpShown}
        className="pb-1 text-xs text-muted-foreground"
      >
        {help}
      </p>
    </div>
  );
}
