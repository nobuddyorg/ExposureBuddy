import { type Locator, type Page } from '@playwright/test';

interface Header {
  (): Locator;
  do: {
    openHelp(): Promise<void>;
    toggleLanguage(): Promise<void>;
    toggleTheme(): Promise<void>;
  };
  locators: {
    buttons: {
      language: Locator;
      openHelp: Locator;
      theme: Locator;
    };
  };
}

/** The bar on every screen: theme, language and help. */
export function initHeader(page: Page): Header {
  const root = page.getByRole('banner');
  const locators = {
    buttons: {
      language: page.getByTestId('language-toggle'),
      openHelp: page.getByTestId('open-help'),
      theme: page.getByTestId('theme-toggle'),
    },
  };
  const interactions = {
    openHelp: async () => {
      await locators.buttons.openHelp.click();
    },
    toggleLanguage: async () => {
      await locators.buttons.language.click();
    },
    toggleTheme: async () => {
      await locators.buttons.theme.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
