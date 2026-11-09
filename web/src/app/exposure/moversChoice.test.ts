import { describe, expect, it } from 'vitest';

import {
  DETECTION_DETAILS_IN_ORDER,
  MOVERS_MODES,
  STANDING_BLUR,
  STANDING_PEOPLE_IN_ORDER,
  moversOf,
} from './moversChoice';

describe('moversOf', () => {
  it('is nothing for the classic look, whatever the rest', () => {
    expect(
      moversOf({ mode: 'classic', detail: 'thorough', standing: 'strong' }),
    ).toBeUndefined();
  });

  it('keeps the detail for the blur, and turns the standing choice into a share of the long edge', () => {
    expect(
      moversOf({ mode: 'blur', detail: 'thorough', standing: 'strong' }),
    ).toEqual({ detail: 'thorough', standingBlur: STANDING_BLUR.strong });
    expect(
      moversOf({ mode: 'blur', detail: 'fast', standing: 'keep' }),
    ).toEqual({ detail: 'fast', standingBlur: 0 });
  });

  it('lists the classic look first, so the default costs nothing, and fast before thorough', () => {
    expect(MOVERS_MODES).toEqual(['classic', 'blur']);
    expect(DETECTION_DETAILS_IN_ORDER).toEqual(['fast', 'thorough']);
  });

  it('blurs standing people the more the further down the list, none for the first', () => {
    expect(STANDING_PEOPLE_IN_ORDER).toEqual(['keep', 'soft', 'strong']);
    expect(STANDING_BLUR.keep).toBe(0);
    expect(STANDING_BLUR.soft).toBeGreaterThan(0);
    expect(STANDING_BLUR.strong).toBeGreaterThan(STANDING_BLUR.soft);
  });
});
