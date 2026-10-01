'use client';

import { useI18n } from '../../i18n/useI18n';
import { cardClasses } from '../ui/cardClasses';
import { BackgroundSelect } from './BackgroundSelect';
import { ParamSlider } from './ParamSlider';
import { TrailsSwitch } from './TrailsSwitch';
import type { BackgroundMode } from '../../vision/types';
import { type SliderName, type SliderValues } from './sliderValues';

export interface SliderPanelProps {
  values: SliderValues;
  background: BackgroundMode;
  /** The top of each slider. */
  max: Record<SliderName, number>;
  /** While comparing with one photo the sliders have nothing to drive. */
  disabled: boolean;
  onChange: (name: SliderName, value: number) => void;
  onBackgroundChange: (mode: BackgroundMode) => void;
  /** Light trails: the brightest value each pixel saw instead of the mean. */
  trails: boolean;
  onTrailsChange: (trails: boolean) => void;
}

/** The card with the background choice, the light-trails switch and the three composite sliders: ghosts, blur and glow. */
export function SliderPanel({
  values,
  background,
  max,
  disabled,
  onChange,
  onBackgroundChange,
  trails,
  onTrailsChange,
}: SliderPanelProps) {
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
    <div className={cardClasses('space-y-1 p-4 sm:p-5')}>
      <BackgroundSelect
        value={background}
        disabled={disabled}
        onChange={onBackgroundChange}
      />
      <TrailsSwitch
        checked={trails}
        disabled={disabled}
        onChange={onTrailsChange}
      />
      {sliders.map((slider) => (
        <ParamSlider
          key={slider.name}
          testId={slider.testId}
          label={slider.label}
          help={slider.help}
          infoLabel={t('result.info', { name: slider.label })}
          unit={slider.unit}
          value={values[slider.name]}
          max={max[slider.name]}
          disabled={disabled}
          onChange={(value) => onChange(slider.name, value)}
        />
      ))}
    </div>
  );
}
