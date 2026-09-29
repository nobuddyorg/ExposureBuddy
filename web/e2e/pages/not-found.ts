import { type Locator, type Page } from '@playwright/test';

interface NotFound {
  (): Locator;
  do: {
    open(): Promise<void>;
  };
  locators: {
    home: Locator;
  };
}

/** The 404 page the export ships, opened directly because the static host answers unknown paths itself. */
export function initNotFound(page: Page): NotFound {
  const root = page.getByRole('main');
  const locators = {
    home: root.getByRole('link').first(),
  };
  const interactions = {
    open: async () => {
      await page.goto('404.html', { waitUntil: 'networkidle' });
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
