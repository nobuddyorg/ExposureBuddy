'use client';

import { useI18n } from '../../i18n/useI18n';
import { cardClasses } from '../ui/cardClasses';
import { ParamSlider } from './ParamSlider';
import { SLIDER_MAX, type SliderName, type SliderValues } from './sliderValues';

export interface SliderPanelProps {
  values: SliderValues;
  /** While comparing with one photo the sliders have nothing to drive. */
  disabled: boolean;
  onChange: (name: SliderName, value: number) => void;
}

/** The card with the three composite sliders: ghosts, blur and glow. */
export function SliderPanel({ values, disabled, onChange }: SliderPanelProps) {
  const { t } = useI18n();
  // Spelled out per slider: the i18n parity test only credits literal t('…') keys.
  const sliders = [
    {
      name: 'ghost' as const,
      testId: 'ghost-slider',
      label: t('result.ghost'),
      help: t('result.ghost_help'),
      unit: '%',
    },
    {
      name: 'blur' as const,
      testId: 'blur-slider',
      label: t('result.blur'),
      help: t('result.blur_help'),
      unit: 'px',
    },
    {
      name: 'glow' as const,
      testId: 'glow-slider',
      label: t('result.glow'),
      help: t('result.glow_help'),
      unit: '%',
    },
  ];

  return (
    <div className={cardClasses('space-y-4 p-4 sm:p-5')}>
      {sliders.map((slider) => (
        <ParamSlider
          key={slider.name}
          testId={slider.testId}
          label={slider.label}
          help={slider.help}
          unit={slider.unit}
          value={values[slider.name]}
          max={SLIDER_MAX[slider.name]}
          disabled={disabled}
          onChange={(value) => onChange(slider.name, value)}
        />
      ))}
    </div>
  );
}
