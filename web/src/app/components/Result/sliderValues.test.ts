import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_COMPOSITE_PARAMS } from '../../vision/stack/compositeParams';
import {
  sliderMax,
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
      ghost: fc.integer({ min: 0, max: sliderMax(1600).ghost }),
      blur: fc.integer({ min: 0, max: sliderMax(1600).blur }),
      glow: fc.integer({ min: 0, max: sliderMax(1600).glow }),
    });
    fc.assert(
      fc.property(values, (sliders) => {
        expect(toSliderValues(toCompositeParams(sliders))).toEqual(sliders);
      }),
    );
  });
});

describe('slider ranges', () => {
  it('keeps 0–100 % for ghosts and glow and at least 32 px for blur', () => {
    expect(sliderMax(500)).toEqual({ ghost: 100, blur: 32, glow: 100 });
    expect(sliderMax(1600).blur).toBe(32);
  });

  it('grows the blur range to 2 % of the long edge, up to the compositor limit', () => {
    expect(sliderMax(3000).blur).toBe(60);
    expect(sliderMax(10_000).blur).toBe(128);
  });
});
