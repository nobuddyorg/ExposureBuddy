import { describe, expect, it } from 'vitest';

import { cardClasses } from './cardClasses';

describe('cardClasses', () => {
  it('lifts the card on the card colour with a hairline edge', () => {
    const classes = cardClasses();
    expect(classes).toContain('bg-card');
    expect(classes).toContain('ring-border');
    expect(classes).toContain('card-lift');
  });

  it('appends a caller-supplied className', () => {
    expect(cardClasses('p-4').endsWith(' p-4')).toBe(true);
    expect(cardClasses()).toBe(cardClasses().trim());
  });
});
