import { describe, expect, it } from 'vitest';

import { MOVERS_CHOICES, moversDetail } from './moversChoice';

describe('moversDetail', () => {
  it('is nothing when moving things are kept', () => {
    expect(moversDetail('off')).toBeUndefined();
  });

  it('is the detection itself otherwise', () => {
    expect(moversDetail('fast')).toBe('fast');
    expect(moversDetail('thorough')).toBe('thorough');
  });

  it('offers off first, so the default costs nothing', () => {
    expect(MOVERS_CHOICES).toEqual(['off', 'fast', 'thorough']);
  });
});
