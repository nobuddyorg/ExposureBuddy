import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  MAX_BUDGET_BYTES,
  MIN_BUDGET_BYTES,
  UNREPORTED_DESKTOP_BUDGET_BYTES,
  UNREPORTED_TOUCH_BUDGET_BYTES,
  deviceBudgetBytes,
} from './deviceBudget';

const MIB = 1024 * 1024;

describe('deviceBudgetBytes', () => {
  it('gives a quarter of a reported memory', () => {
    expect(deviceBudgetBytes({ kind: 'reported', gibibytes: 4 })).toBe(
      1024 * MIB,
    );
    expect(deviceBudgetBytes({ kind: 'reported', gibibytes: 2 })).toBe(
      512 * MIB,
    );
  });

  it('never goes below 256 MiB or above 2 GiB', () => {
    expect(deviceBudgetBytes({ kind: 'reported', gibibytes: 0.25 })).toBe(
      256 * MIB,
    );
    expect(deviceBudgetBytes({ kind: 'reported', gibibytes: 32 })).toBe(
      2048 * MIB,
    );
    expect(MIN_BUDGET_BYTES).toBe(256 * MIB);
    expect(MAX_BUDGET_BYTES).toBe(2048 * MIB);
  });

  it('guesses by input type when the browser reports nothing', () => {
    expect(deviceBudgetBytes({ kind: 'unreported', touch: true })).toBe(
      UNREPORTED_TOUCH_BUDGET_BYTES,
    );
    expect(deviceBudgetBytes({ kind: 'unreported', touch: false })).toBe(
      UNREPORTED_DESKTOP_BUDGET_BYTES,
    );
    expect(UNREPORTED_TOUCH_BUDGET_BYTES).toBe(768 * MIB);
    expect(UNREPORTED_DESKTOP_BUDGET_BYTES).toBe(1536 * MIB);
  });

  it('grows with the reported memory and stays within its bounds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.25, max: 64, noNaN: true }),
        fc.double({ min: 0.25, max: 64, noNaN: true }),
        (smaller, larger) => {
          const [low, high] = [smaller, larger].sort((a, b) => a - b);
          const lowBudget = deviceBudgetBytes({
            kind: 'reported',
            gibibytes: low,
          });
          const highBudget = deviceBudgetBytes({
            kind: 'reported',
            gibibytes: high,
          });
          expect(lowBudget).toBeLessThanOrEqual(highBudget);
          expect(lowBudget).toBeGreaterThanOrEqual(MIN_BUDGET_BYTES);
          expect(highBudget).toBeLessThanOrEqual(MAX_BUDGET_BYTES);
        },
      ),
    );
  });
});
