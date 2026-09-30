const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;

/** What the browser says about the device: Chromium reports its memory, rounded down and capped; other engines do not. */
export type DeviceMemory =
  | { readonly kind: 'reported'; readonly gibibytes: number }
  | { readonly kind: 'unreported'; readonly touch: boolean };

/** The share of a reported device memory one tab's pipeline may use. */
const REPORTED_SHARE = 0.25;
/** Never below the budget the app shipped with, whatever a small device reports. */
export const MIN_BUDGET_BYTES = 256 * MEBIBYTE;
/** Never above what one renderer process holds comfortably, whatever a large device reports. */
export const MAX_BUDGET_BYTES = 2 * GIBIBYTE;
/** An iPhone or iPad, or an Android browser that keeps its memory to itself. */
export const UNREPORTED_TOUCH_BUDGET_BYTES = 768 * MEBIBYTE;
/** A desktop Firefox or Safari. */
export const UNREPORTED_DESKTOP_BUDGET_BYTES = 1536 * MEBIBYTE;

/** The pipeline's memory budget on this device: a quarter of a reported memory within [256 MiB, 2 GiB], else a guess by input type. */
export function deviceBudgetBytes(memory: DeviceMemory): number {
  switch (memory.kind) {
    case 'reported': {
      const share = memory.gibibytes * GIBIBYTE * REPORTED_SHARE;
      return Math.min(MAX_BUDGET_BYTES, Math.max(MIN_BUDGET_BYTES, share));
    }
    case 'unreported':
      return memory.touch
        ? UNREPORTED_TOUCH_BUDGET_BYTES
        : UNREPORTED_DESKTOP_BUDGET_BYTES;
  }
}
