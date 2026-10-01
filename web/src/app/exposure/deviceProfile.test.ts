import { describe, expect, it } from 'vitest';

import {
  UNREPORTED_DESKTOP_BUDGET_BYTES,
  UNREPORTED_TOUCH_BUDGET_BYTES,
} from '../vision/pipeline/deviceBudget';
import { readDeviceProfile } from './deviceProfile';

describe('readDeviceProfile', () => {
  it('budgets a quarter of a reported memory and one worker less than the cores', () => {
    expect(
      readDeviceProfile({
        hardwareConcurrency: 8,
        deviceMemory: 4,
        maxTouchPoints: 5,
      }),
    ).toEqual({ poolSize: 4, budgetBytes: 1024 * 1024 * 1024 });
  });

  it('guesses from touch input where the memory is not reported', () => {
    expect(
      readDeviceProfile({ hardwareConcurrency: 6, maxTouchPoints: 5 }),
    ).toEqual({ poolSize: 4, budgetBytes: UNREPORTED_TOUCH_BUDGET_BYTES });
    expect(readDeviceProfile({ maxTouchPoints: 0 })).toEqual({
      poolSize: 2,
      budgetBytes: UNREPORTED_DESKTOP_BUDGET_BYTES,
    });
  });
});
