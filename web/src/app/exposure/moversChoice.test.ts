import { describe, expect, it } from 'vitest';

import {
  DETECTION_DETAILS_IN_ORDER,
  MOVERS_MODES,
  STANDING_BLUR,
  STANDING_PEOPLE_IN_ORDER,
  moversOf,
} from './moversChoice';

describe('moversOf', () => {
  it('is nothing when moving things are kept, whatever the rest', () => {
    expect(
      moversOf({ mode: 'off', detail: 'thorough', standing: 'strong' }),
    ).toBeUndefined();
  });

  it('keeps the look and the detail otherwise, and turns the standing choice into a share of the long edge', () => {
    expect(
      moversOf({ mode: 'remove', detail: 'fast', standing: 'keep' }),
    ).toEqual({ look: 'remove', detail: 'fast', standingBlur: 0 });
    expect(
      moversOf({ mode: 'trail', detail: 'thorough', standing: 'strong' }),
    ).toEqual({
      look: 'trail',
      detail: 'thorough',
      standingBlur: STANDING_BLUR.strong,
    });
  });

  it('lists off first, so the default costs nothing, and fast before thorough', () => {
    expect(MOVERS_MODES).toEqual(['off', 'remove', 'trail']);
    expect(DETECTION_DETAILS_IN_ORDER).toEqual(['fast', 'thorough']);
  });

  it('blurs standing people the more the further down the list, none for the first', () => {
    expect(STANDING_PEOPLE_IN_ORDER).toEqual(['keep', 'soft', 'strong']);
    expect(STANDING_BLUR.keep).toBe(0);
    expect(STANDING_BLUR.soft).toBeGreaterThan(0);
    expect(STANDING_BLUR.strong).toBeGreaterThan(STANDING_BLUR.soft);
  });
});
