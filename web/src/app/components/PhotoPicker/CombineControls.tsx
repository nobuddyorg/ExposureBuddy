'use client';

import { useId, useState } from 'react';

import { MIN_PHOTOS } from '../../exposure/pickedPhotos';
import { useI18n } from '../../i18n/useI18n';
import type { OutputQuality } from '../../vision/pipeline/budget';
import { buttonClasses } from '../ui/buttonClasses';
import { cardClasses } from '../ui/cardClasses';
import { fieldClasses, labelClasses } from '../ui/fieldClasses';

export interface CombineControlsProps {
  count: number;
  unsupported: boolean;
  onCombine: (quality: OutputQuality) => void;
}

/** The output size choice and the one primary action; disabled, with the reason, until the burst is big enough. */
export function CombineControls({
  count,
  unsupported,
  onCombine,
}: CombineControlsProps) {
  const { t, tCount } = useI18n();
  const [quality, setQuality] = useState<OutputQuality>('standard');
  const selectId = useId();
  const reasonId = useId();
  const tooFew = count < MIN_PHOTOS;
  // Spelled out per option: the i18n parity test only sees literal t('…') keys.
  const options: readonly { value: OutputQuality; label: string }[] = [
    { value: 'low', label: t('picker.quality_low') },
    { value: 'standard', label: t('picker.quality_standard') },
    { value: 'high', label: t('picker.quality_high') },
  ];

  return (
    <div
      className={cardClasses(
        'flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:p-5',
      )}
    >
      <div className="flex-1">
        <label htmlFor={selectId} className={labelClasses('mb-1.5')}>
          {t('picker.quality')}
        </label>
        <select
          id={selectId}
          data-testid="quality-select"
          value={quality}
          onChange={(event) => setQuality(event.target.value as OutputQuality)}
          className={fieldClasses()}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5 sm:items-end">
        <button
          type="button"
          data-testid="combine"
          disabled={tooFew || unsupported}
          aria-describedby={tooFew ? reasonId : undefined}
          onClick={() => onCombine(quality)}
          className={buttonClasses({ className: 'w-full sm:w-auto' })}
        >
          {tCount('picker.combine', count)}
        </button>
        {tooFew && (
          <p id={reasonId} className="text-xs text-muted-foreground">
            {t('picker.need_more', { count: MIN_PHOTOS })}
          </p>
        )}
      </div>
    </div>
  );
}
