import type { CompositeParams } from '../../vision/types';
import { clampCompositeParams } from '../../vision/stack/compositeParams';

/** The three sliders as the visitor sees them: ghosts and glow in percent, blur in pixels. */
export interface SliderValues {
  readonly ghost: number;
  readonly blur: number;
  readonly glow: number;
}

export type SliderName = keyof SliderValues;

const PERCENT = 100;
const MAX_BLUR_PX = 32;

export const SLIDER_MAX: Record<SliderName, number> = {
  ghost: PERCENT,
  blur: MAX_BLUR_PX,
  glow: PERCENT,
};

/** The composite parameters the sliders stand for, clamped to what the compositor accepts. */
export function toCompositeParams(values: SliderValues): CompositeParams {
  return clampCompositeParams({
    ghostStrength: values.ghost / PERCENT,
    ghostBlur: values.blur,
    glow: values.glow / PERCENT,
  });
}

/** The slider positions showing `params`, rounded to whole percent and pixels. */
export function toSliderValues(params: CompositeParams): SliderValues {
  return {
    ghost: Math.round(params.ghostStrength * PERCENT),
    blur: Math.round(params.ghostBlur),
    glow: Math.round(params.glow * PERCENT),
  };
}
