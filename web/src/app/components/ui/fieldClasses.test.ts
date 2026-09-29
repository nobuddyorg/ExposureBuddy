import { describe, expect, it } from 'vitest';

import { fieldClasses, labelClasses, rangeClasses } from './fieldClasses';

describe('fieldClasses', () => {
  it('frames the field with the 3:1 control edge at a 44px height', () => {
    const classes = fieldClasses();
    expect(classes).toContain('ring-control-border');
    expect(classes).toContain('min-h-11');
  });

  it('appends a caller-supplied className', () => {
    expect(fieldClasses('max-w-xs').endsWith(' max-w-xs')).toBe(true);
    expect(fieldClasses()).toBe(fieldClasses().trim());
  });
});

describe('labelClasses', () => {
  it('draws the caption in the muted ink', () => {
    expect(labelClasses()).toContain('text-muted-foreground');
  });

  it('appends a caller-supplied className', () => {
    expect(labelClasses('mb-1').endsWith(' mb-1')).toBe(true);
  });
});

describe('rangeClasses', () => {
  // The class name is the contract with globals.css; the styling itself is asserted there.
  it('names the range class globals.css styles', () => {
    expect(rangeClasses()).toBe('range');
  });

  it('appends a caller-supplied className', () => {
    expect(rangeClasses('mt-2')).toBe('range mt-2');
  });
});
