'use client';

import { useId, useState } from 'react';

import type { DeviceProfile } from '../../exposure/deviceProfile';
import { MIN_PHOTOS } from '../../exposure/pickedPhotos';
import type { ReferenceSize } from '../../exposure/useReferenceSize';
import { useI18n } from '../../i18n/useI18n';
import {
  estimateOutput,
  type OutputQuality,
} from '../../vision/pipeline/budget';
import { buttonClasses } from '../ui/buttonClasses';
import { cardClasses } from '../ui/cardClasses';
import { fieldClasses, labelClasses } from '../ui/fieldClasses';

export interface CombineControlsProps {
  count: number;
  unsupported: boolean;
  /** The size of the photo the pipeline aligns to, for the result-size line. */
  referenceSize: ReferenceSize;
  device: DeviceProfile;
  onCombine: (quality: OutputQuality) => void;
}

/** The output size choice and the one primary action; disabled, with the reason, until the burst is big enough. */
export function CombineControls({
  count,
  unsupported,
  referenceSize,
  device,
  onCombine,
}: CombineControlsProps) {
  const { t, tCount } = useI18n();
  const [quality, setQuality] = useState<OutputQuality>('standard');
  const selectId = useId();
  const reasonId = useId();
  const sizeId = useId();
  const tooFew = count < MIN_PHOTOS;
  const sizeLine = (): string => {
    if (referenceSize.kind === 'none')
      return count > 0 ? t('picker.result_reading') : '';
    if (referenceSize.kind === 'unreadable') return '';
    const estimate = estimateOutput({
      source: referenceSize.size,
      frameCount: count,
      budgetBytes: device.budgetBytes,
      quality,
      requestedWorkers: device.poolSize,
    });
    const size = t('picker.result_size', {
      width: estimate.width,
      height: estimate.height,
    });
    return estimate.limited ? `${size}. ${t('picker.result_limited')}` : size;
  };
  // Spelled out per option: the i18n parity test only sees literal t('…') keys.
  const options: readonly { value: OutputQuality; label: string }[] = [
    { value: 'low', label: t('picker.quality_low') },
    { value: 'standard', label: t('picker.quality_standard') },
    { value: 'high', label: t('picker.quality_high') },
  ];

  return (
    <div className={cardClasses('flex flex-col gap-3 p-4 sm:p-5')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor={selectId} className={labelClasses('mb-1.5')}>
            {t('picker.quality')}
          </label>
          <select
            id={selectId}
            data-testid="quality-select"
            value={quality}
            aria-describedby={sizeId}
            onChange={(event) =>
              setQuality(event.target.value as OutputQuality)
            }
            className={fieldClasses()}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p
            id={sizeId}
            data-testid="result-size"
            aria-live="polite"
            className="mt-1.5 min-h-4 text-xs text-muted-foreground"
          >
            {sizeLine()}
          </p>
        </div>
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
      </div>
      {tooFew && (
        <p
          id={reasonId}
          className="text-xs text-muted-foreground sm:text-right"
        >
          {t('picker.need_more', { count: MIN_PHOTOS })}
        </p>
      )}
    </div>
  );
}
