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
