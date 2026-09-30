import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { CompositeParams } from '../types';
import {
  DEFAULT_COMPOSITE_PARAMS,
  clampCompositeParams,
  defaultCompositeParams,
  MAX_GHOST_BLUR,
} from './compositeParams';

describe('clampCompositeParams', () => {
  it('keeps a known background and falls back to the default for an unknown one', () => {
    const params = { ...DEFAULT_COMPOSITE_PARAMS };
    expect(
      clampCompositeParams({ ...params, background: 'clipped' }).background,
    ).toBe('clipped');
    expect(
      clampCompositeParams({
        ...params,
        background: 'nonsense' as CompositeParams['background'],
      }).background,
    ).toBe(DEFAULT_COMPOSITE_PARAMS.background);
  });

  it('keeps values already in range', () => {
    expect(clampCompositeParams(DEFAULT_COMPOSITE_PARAMS)).toEqual(
      DEFAULT_COMPOSITE_PARAMS,
    );
    const edge = {
      background: 'median' as const,
      ghostStrength: 1,
      ghostBlur: MAX_GHOST_BLUR,
      glow: 0,
    };
    expect(clampCompositeParams(edge)).toEqual(edge);
  });

  it('clamps strength and glow to [0, 1] and the blur to [0, 128]', () => {
    expect(
      clampCompositeParams({
        background: 'median' as const,
        ghostStrength: 1.5,
        ghostBlur: 200,
        glow: -1,
      }),
    ).toEqual({
      background: 'median' as const,
      ghostStrength: 1,
      ghostBlur: 128,
      glow: 0,
    });
    expect(
      clampCompositeParams({
        background: 'median' as const,
        ghostStrength: -0.2,
        ghostBlur: -3,
        glow: 7,
      }),
    ).toEqual({
      background: 'median' as const,
      ghostStrength: 0,
      ghostBlur: 0,
      glow: 1,
    });
  });

  it('rounds the blur radius to whole pixels', () => {
    expect(
      clampCompositeParams({
        background: 'median' as const,
        ghostStrength: 0.5,
        ghostBlur: 2.5,
        glow: 0,
      }).ghostBlur,
    ).toBe(3);
    expect(
      clampCompositeParams({
        background: 'median' as const,
        ghostStrength: 0.5,
        ghostBlur: 2.4,
        glow: 0,
      }).ghostBlur,
    ).toBe(2);
  });

  it('replaces NaN with the default, field by field', () => {
    expect(
      clampCompositeParams({
        background: 'median' as const,
        ghostStrength: NaN,
        ghostBlur: NaN,
        glow: NaN,
      }),
    ).toEqual(DEFAULT_COMPOSITE_PARAMS);
    expect(
      clampCompositeParams({
        background: 'median' as const,
        ghostStrength: NaN,
        ghostBlur: 2,
        glow: 0.1,
      }),
    ).toEqual({
      background: 'median' as const,
      ghostStrength: DEFAULT_COMPOSITE_PARAMS.ghostStrength,
      ghostBlur: 2,
      glow: 0.1,
    });
  });
});

describe('defaultCompositeParams', () => {
  it('opens a settled burst with the classic look: 60 % ghosts, 4 px of blur per 1600 px, 25 % glow', () => {
    expect(defaultCompositeParams({ frameCount: 10, longEdge: 1600 })).toEqual({
      background: 'median' as const,
      ghostStrength: 0.6,
      ghostBlur: 4,
      glow: 0.25,
    });
    expect(defaultCompositeParams({ frameCount: 40, longEdge: 1600 })).toEqual({
      background: 'median' as const,
      ghostStrength: 0.6,
      ghostBlur: 4,
      glow: 0.25,
    });
  });

  it('makes the ghosts fainter and softer the fewer frames there are', () => {
    expect(defaultCompositeParams({ frameCount: 8, longEdge: 1600 })).toEqual({
      background: 'median' as const,
      ghostStrength: 0.48,
      ghostBlur: 5,
      glow: 0.25,
    });
    expect(defaultCompositeParams({ frameCount: 4, longEdge: 1600 })).toEqual({
      background: 'median' as const,
      ghostStrength: 0.25,
      ghostBlur: 10,
      glow: 0.25,
    });
  });

  it('stops at 25 % ghosts and three times the blur, however few the frames', () => {
    expect(defaultCompositeParams({ frameCount: 2, longEdge: 1600 })).toEqual({
      background: 'median' as const,
      ghostStrength: 0.25,
      ghostBlur: 12,
      glow: 0.25,
    });
  });

  it('scales the blur with the image, up to the compositor limit', () => {
    expect(
      defaultCompositeParams({ frameCount: 10, longEdge: 800 }).ghostBlur,
    ).toBe(2);
    expect(
      defaultCompositeParams({ frameCount: 2, longEdge: 100_000 }).ghostBlur,
    ).toBe(MAX_GHOST_BLUR);
  });

  it('never gets stronger or sharper as frames are taken away', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 100, max: 8000 }),
        (frameCount, longEdge) => {
          const fewer = defaultCompositeParams({ frameCount, longEdge });
          const more = defaultCompositeParams({
            frameCount: frameCount + 1,
            longEdge,
          });
          expect(fewer.ghostStrength).toBeLessThanOrEqual(more.ghostStrength);
          expect(fewer.ghostBlur).toBeGreaterThanOrEqual(more.ghostBlur);
        },
      ),
    );
  });
});
