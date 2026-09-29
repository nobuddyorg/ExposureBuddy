import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { exportFileName } from './exportFileName';

describe('exportFileName', () => {
  it('names the file by the local date and time, to the minute', () => {
    expect(exportFileName(new Date(2026, 8, 28, 14, 32, 59))).toBe(
      'exposurebuddy-2026-09-28-1432.jpg',
    );
  });

  it('pads every part to two digits', () => {
    expect(exportFileName(new Date(2026, 0, 5, 7, 3))).toBe(
      'exposurebuddy-2026-01-05-0703.jpg',
    );
  });

  it('always yields a .jpg name in the same shape', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date(2000, 0, 1),
          max: new Date(2099, 11, 31, 23, 59),
        }),
        (date) => {
          expect(exportFileName(date)).toMatch(
            /^exposurebuddy-\d{4}-\d{2}-\d{2}-\d{4}\.jpg$/,
          );
        },
      ),
    );
  });
});
