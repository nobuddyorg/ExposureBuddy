import { type Locator, type Page } from '@playwright/test';

interface Privacy {
  (): Locator;
  do: {
    back(): Promise<void>;
    openFromFooter(): Promise<void>;
  };
  locators: {
    back: Locator;
    footerLink: Locator;
    heading: Locator;
  };
}

/** The privacy page, reached from the footer of every screen. */
export function initPrivacy(page: Page): Privacy {
  const root = page.getByTestId('privacy');
  const locators = {
    back: page.getByTestId('privacy-back'),
    footerLink: page.getByTestId('privacy-link'),
    heading: root.getByRole('heading', { level: 1 }),
  };
  const interactions = {
    back: async () => {
      await locators.back.click();
    },
    openFromFooter: async () => {
      await locators.footerLink.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
