import { describe, expect, it } from 'vitest';

import { buttonClasses, iconButtonClasses } from './buttonClasses';

describe('buttonClasses', () => {
  it('puts the accent on the primary button and nowhere else', () => {
    expect(buttonClasses()).toContain('bg-accent');
    expect(buttonClasses({ variant: 'secondary' })).not.toContain('bg-accent');
    expect(buttonClasses({ variant: 'ghost' })).not.toContain('bg-accent');
  });

  it('frames the secondary button with the 3:1 control edge', () => {
    expect(buttonClasses({ variant: 'secondary' })).toContain(
      'ring-control-border',
    );
  });

  it('keeps a 44px tap target', () => {
    expect(buttonClasses()).toContain('min-h-11');
  });

  // :hover ignores the disabled attribute, so a dimmed disabled control would still look interactive.
  it('kills pointer events, and therefore hover, when disabled', () => {
    expect(buttonClasses()).toContain('disabled:pointer-events-none');
  });

  it('appends a caller-supplied className without dropping the defaults', () => {
    const classes = buttonClasses({ className: 'w-full' });
    expect(classes.endsWith(' w-full')).toBe(true);
    expect(classes).toContain('min-h-11');
  });

  it('has no trailing space without an extra className', () => {
    expect(buttonClasses()).toBe(buttonClasses().trim());
  });
});

describe('iconButtonClasses', () => {
  it('is a 44px square, ghost by default', () => {
    const classes = iconButtonClasses();
    expect(classes).toContain('w-11 h-11');
    expect(classes).toContain('hover:bg-muted');
    expect(classes).not.toContain('bg-accent');
  });

  it('takes the same variants as the labelled button', () => {
    expect(iconButtonClasses({ variant: 'primary' })).toContain('bg-accent');
    expect(iconButtonClasses({ variant: 'secondary' })).toContain(
      'ring-control-border',
    );
  });

  it('appends a caller-supplied className', () => {
    expect(iconButtonClasses({ className: 'ml-2' }).endsWith(' ml-2')).toBe(
      true,
    );
  });
});
