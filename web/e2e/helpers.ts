import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, type Page } from '@playwright/test';

export type PageProblems = { errors: string[]; console: string[] };

/** Where `npm run fixtures` (scripts/make-fixtures.mjs) writes the synthetic bursts. */
const GENERATED_FIXTURES = resolve(process.cwd(), 'e2e/fixtures/generated');

/** Call before the first navigation -- listeners attached later miss everything from page load. */
export function collectPageProblems(page: Page): PageProblems {
  const problems: PageProblems = { errors: [], console: [] };
  page.on('pageerror', (error) => problems.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.console.push(message.text());
  });
  return problems;
}

/** The main landmark, which receives focus whenever the screen changes. */
export function mainLandmark(page: Page) {
  return page.getByRole('main');
}

/** Console errors are held to the same standard as thrown ones. */
export function expectNoPageProblems(problems: PageProblems) {
  expect(problems.errors, 'uncaught errors').toEqual([]);
  expect(problems.console, 'console errors').toEqual([]);
}

/** The computed value of a custom property (or any property) on `<html>`, trimmed. */
export function cssVariable(page: Page, name: string) {
  return page.evaluate(
    (property) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(property)
        .trim(),
    name,
  );
}

/** Absolute path of a generated fixture, e.g. `burst-street/meta.json` or `not-an-image.txt`. */
export function fixturePath(name: string): string {
  return resolve(GENERATED_FIXTURES, name);
}

/** Absolute paths of a generated burst's frames (`frame-NN.png`), sorted, without background.png. */
export function listBurst(name: string): string[] {
  return readdirSync(fixturePath(name))
    .filter((file) => /^frame-\d+\.png$/.test(file))
    .sort()
    .map((file) => fixturePath(`${name}/${file}`));
}

interface WakeLockRecord {
  requested: number;
  held: number;
}

/** Call before the first navigation: swaps navigator.wakeLock for a recorder, since a headless screen never sleeps. */
export async function recordWakeLocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = { requested: 0, held: 0 };
    Object.defineProperty(window, '__wakeLocks', { value: record });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: () => {
          record.requested += 1;
          record.held += 1;
          let released = false;
          const release = () => {
            if (!released) record.held -= 1;
            released = true;
            return Promise.resolve();
          };
          return Promise.resolve({ release });
        },
      },
    });
  });
}

/** How many screen locks the app asked for so far, and how many it still holds. */
export function wakeLocks(page: Page): Promise<WakeLockRecord> {
  return page.evaluate(
    () => (window as unknown as { __wakeLocks: WakeLockRecord }).__wakeLocks,
  );
}

/** True when leaving now would ask to confirm: a synthetic beforeunload reaches the app's listener without opening a real dialog. */
export function leaveIsGuarded(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}
