import { describe, expect, it } from 'vitest';

import {
  DETECTION_DETAILS_IN_ORDER,
  MOVERS_MODES,
  moversOf,
} from './moversChoice';

describe('moversOf', () => {
  it('is nothing when moving things are kept, whatever the detail', () => {
    expect(moversOf({ mode: 'off', detail: 'thorough' })).toBeUndefined();
  });

  it('keeps the look and the detail otherwise', () => {
    expect(moversOf({ mode: 'remove', detail: 'fast' })).toEqual({
      look: 'remove',
      detail: 'fast',
    });
    expect(moversOf({ mode: 'blur', detail: 'thorough' })).toEqual({
      look: 'blur',
      detail: 'thorough',
    });
  });

  it('lists off first, so the default costs nothing, and fast before thorough', () => {
    expect(MOVERS_MODES).toEqual(['off', 'remove', 'blur']);
    expect(DETECTION_DETAILS_IN_ORDER).toEqual(['fast', 'thorough']);
  });
});
