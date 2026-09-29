import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_COMPOSITE_PARAMS } from '../../vision/stack/compositeParams';
import {
  SLIDER_MAX,
  toCompositeParams,
  toSliderValues,
  type SliderValues,
} from './sliderValues';

describe('slider values', () => {
  it('shows the defaults as 60 %, 4 px and 25 %', () => {
    expect(toSliderValues(DEFAULT_COMPOSITE_PARAMS)).toEqual({
      ghost: 60,
      blur: 4,
      glow: 25,
    });
  });

  it('maps percent to a 0–1 strength and keeps the blur in pixels', () => {
    expect(toCompositeParams({ ghost: 50, blur: 12, glow: 100 })).toEqual({
      ghostStrength: 0.5,
      ghostBlur: 12,
      glow: 1,
    });
  });

  it('clamps a value past the slider range instead of passing it on', () => {
    expect(toCompositeParams({ ghost: 150, blur: -3, glow: 200 })).toEqual({
      ghostStrength: 1,
      ghostBlur: 0,
      glow: 1,
    });
  });

  it('round-trips every whole slider position', () => {
    const values = fc.record<SliderValues>({
      ghost: fc.integer({ min: 0, max: SLIDER_MAX.ghost }),
      blur: fc.integer({ min: 0, max: SLIDER_MAX.blur }),
      glow: fc.integer({ min: 0, max: SLIDER_MAX.glow }),
    });
    fc.assert(
      fc.property(values, (sliders) => {
        expect(toSliderValues(toCompositeParams(sliders))).toEqual(sliders);
      }),
    );
  });
});
