import { describe, expect, it } from 'vitest';

import {
  DEFAULT_COMPOSITE_PARAMS,
  clampCompositeParams,
} from './compositeParams';

describe('clampCompositeParams', () => {
  it('keeps values already in range', () => {
    expect(clampCompositeParams(DEFAULT_COMPOSITE_PARAMS)).toEqual(
      DEFAULT_COMPOSITE_PARAMS,
    );
    const edge = { ghostStrength: 1, ghostBlur: 32, glow: 0 };
    expect(clampCompositeParams(edge)).toEqual(edge);
  });

  it('clamps strength and glow to [0, 1] and the blur to [0, 32]', () => {
    expect(
      clampCompositeParams({ ghostStrength: 1.5, ghostBlur: 40, glow: -1 }),
    ).toEqual({
      ghostStrength: 1,
      ghostBlur: 32,
      glow: 0,
    });
    expect(
      clampCompositeParams({ ghostStrength: -0.2, ghostBlur: -3, glow: 7 }),
    ).toEqual({
      ghostStrength: 0,
      ghostBlur: 0,
      glow: 1,
    });
  });

  it('rounds the blur radius to whole pixels', () => {
    expect(
      clampCompositeParams({ ghostStrength: 0.5, ghostBlur: 2.5, glow: 0 })
        .ghostBlur,
    ).toBe(3);
    expect(
      clampCompositeParams({ ghostStrength: 0.5, ghostBlur: 2.4, glow: 0 })
        .ghostBlur,
    ).toBe(2);
  });

  it('replaces NaN with the default, field by field', () => {
    expect(
      clampCompositeParams({ ghostStrength: NaN, ghostBlur: NaN, glow: NaN }),
    ).toEqual(DEFAULT_COMPOSITE_PARAMS);
    expect(
      clampCompositeParams({ ghostStrength: NaN, ghostBlur: 2, glow: 0.1 }),
    ).toEqual({
      ghostStrength: DEFAULT_COMPOSITE_PARAMS.ghostStrength,
      ghostBlur: 2,
      glow: 0.1,
    });
  });
});
