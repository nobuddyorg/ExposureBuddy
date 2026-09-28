import type { Page } from '@playwright/test';

import { expect, test } from '../fixture';

import { cssVariable } from '../helpers';

// globals.css: --background in the light and the dark theme.
const PAPER = 'rgb(245, 241, 232)';
const DARKROOM = 'rgb(15, 14, 12)';

const themeAttribute = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

// The pre-React half: an inline script sets the theme before hydration, or the wrong one flashes.
test.describe('the theme a page arrives in', () => {
  test('follows a dark OS when nothing has been chosen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('');
    expect(await themeAttribute(page)).toBe('dark');
    await expect(page.locator('body')).toHaveCSS('background-color', DARKROOM);
  });

  test('follows a light OS when nothing has been chosen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('');
    expect(await themeAttribute(page)).toBe('light');
    await expect(page.locator('body')).toHaveCSS('background-color', PAPER);
  });

  test('lets a stored choice overrule the OS', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('');
    expect(await themeAttribute(page)).toBe('dark');
    await expect(page.locator('body')).toHaveCSS('background-color', DARKROOM);
  });

  test('and the other way round', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('');
    expect(await themeAttribute(page)).toBe('light');
  });

  // Storage is not a trusted input; an invalid value must fall back to the OS.
  test('falls back to the OS for a stored value that is not a theme', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('theme', 'sepia'));
    await page.goto('');
    expect(await themeAttribute(page)).toBe('dark');
  });

  // domcontentloaded fires before hydration, so this fails if only React ever sets the attribute.
  test('is decided before the page is interactive, not after', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('', { waitUntil: 'domcontentloaded' });
    expect(await themeAttribute(page)).toBe('dark');
    await expect(page.locator('body')).toHaveCSS('background-color', DARKROOM);
  });

  test('tells the browser which way round the page is', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('');
    // Drives the scrollbars and any native control the app does not style.
    expect(await cssVariable(page, 'color-scheme')).toBe('dark');
  });

  test('the toggle changes the theme and the choice survives a reload', async ({
    on,
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await on(page).picker.do.open();
    // The cycle is system, light, dark: two presses from the light OS land on dark.
    await on(page).header.do.toggleTheme();
    await on(page).header.do.toggleTheme();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  // Browser chrome around an installed app is the one surface CSS can't reach.
  test('declares a theme colour for each scheme', async ({ page }) => {
    await page.goto('');
    const metas = page.locator('meta[name="theme-color"]');
    await expect(metas).toHaveCount(2);
    await expect(metas.first()).toHaveAttribute('content', '#f5f1e8');
    await expect(metas.last()).toHaveAttribute('content', '#0f0e0c');
  });
});
