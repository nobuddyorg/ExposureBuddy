import { workerPoolSize } from '../vision/pipeline/budget';
import {
  deviceBudgetBytes,
  type DeviceMemory,
} from '../vision/pipeline/deviceBudget';

/** What the pipeline may use on this device: how many align workers it could run and how many bytes it may hold. */
export interface DeviceProfile {
  readonly poolSize: number;
  readonly budgetBytes: number;
}

/** The parts of `navigator` the profile reads; `deviceMemory` is Chromium-only. */
export interface DeviceNavigator {
  readonly hardwareConcurrency?: number;
  readonly deviceMemory?: number;
  readonly maxTouchPoints: number;
}

function memoryOf(device: DeviceNavigator): DeviceMemory {
  return typeof device.deviceMemory === 'number'
    ? { kind: 'reported', gibibytes: device.deviceMemory }
    : { kind: 'unreported', touch: device.maxTouchPoints > 0 };
}

/** The pool size from the core count and the budget from the reported memory, or a guess by input type where none is reported. */
export function readDeviceProfile(device: DeviceNavigator): DeviceProfile {
  return {
    poolSize: workerPoolSize(device.hardwareConcurrency),
    budgetBytes: deviceBudgetBytes(memoryOf(device)),
  };
}
