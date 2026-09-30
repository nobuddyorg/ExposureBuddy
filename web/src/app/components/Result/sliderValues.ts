import type { CompositeParams } from '../../vision/types';
import {
  clampCompositeParams,
  MAX_GHOST_BLUR,
} from '../../vision/stack/compositeParams';

/** The three sliders as the visitor sees them: ghosts and glow in percent, blur in pixels. */
export interface SliderValues {
  readonly ghost: number;
  readonly blur: number;
  readonly glow: number;
}

export type SliderName = keyof SliderValues;

const PERCENT = 100;
const MIN_MAX_BLUR_PX = 32;
const MAX_BLUR_PER_LONG_EDGE = 0.02;

/** The top of each slider; the blur range grows with the image, so a large result can still be smeared visibly. */
export function sliderMax(longEdge: number): Record<SliderName, number> {
  return {
    ghost: PERCENT,
    blur: Math.min(
      MAX_GHOST_BLUR,
      Math.max(MIN_MAX_BLUR_PX, Math.round(longEdge * MAX_BLUR_PER_LONG_EDGE)),
    ),
    glow: PERCENT,
  };
}

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
