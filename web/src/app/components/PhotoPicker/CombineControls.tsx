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
    const notes = [
      ...(estimate.limited ? [t('picker.result_limited')] : []),
      ...(estimate.passes > 1
        ? [t('picker.result_passes', { count: estimate.passes })]
        : []),
    ];
    return notes.length === 0 ? size : `${size}. ${notes.join(' ')}`;
  };
  // Spelled out per option: the i18n parity test only sees literal t('…') keys.
  const options: readonly { value: OutputQuality; label: string }[] = [
    { value: 'low', label: t('picker.quality_low') },
    { value: 'standard', label: t('picker.quality_standard') },
    { value: 'high', label: t('picker.quality_high') },
    { value: 'original', label: t('picker.quality_original') },
  ];

  return (
    // A grid, so the button lines up with the select and both hint lines share the row below.
    <div
      className={cardClasses('grid gap-x-4 p-4 sm:grid-cols-[1fr_auto] sm:p-5')}
    >
      <label
        htmlFor={selectId}
        className={labelClasses('mb-1.5 sm:col-start-1 sm:row-start-1')}
      >
        {t('picker.quality')}
      </label>
      <select
        id={selectId}
        data-testid="quality-select"
        value={quality}
        aria-describedby={sizeId}
        onChange={(event) => setQuality(event.target.value as OutputQuality)}
        className={fieldClasses('sm:col-start-1 sm:row-start-2')}
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
        className="mt-1.5 min-h-4 text-xs text-muted-foreground sm:col-start-1 sm:row-start-3"
      >
        {sizeLine()}
      </p>
      <button
        type="button"
        data-testid="combine"
        disabled={tooFew || unsupported}
        aria-describedby={tooFew ? reasonId : undefined}
        onClick={() => onCombine(quality)}
        className={buttonClasses({
          className: 'mt-4 w-full sm:col-start-2 sm:row-start-2 sm:mt-0',
        })}
      >
        {tCount('picker.combine', count)}
      </button>
      {tooFew && (
        <p
          id={reasonId}
          className="mt-3 text-xs text-muted-foreground sm:col-start-2 sm:row-start-3 sm:mt-1.5 sm:text-right"
        >
          {t('picker.need_more', { count: MIN_PHOTOS })}
        </p>
      )}
    </div>
  );
}
