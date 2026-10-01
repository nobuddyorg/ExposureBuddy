import { type Locator, type Page } from '@playwright/test';

interface Help {
  (): Locator;
  do: {
    close(): Promise<void>;
    openByKeyboard(): Promise<void>;
  };
  locators: {
    buttons: {
      close: Locator;
    };
    version: Locator;
  };
}

/** The help dialog; opened from the header (header.ts) or with Ctrl+/ (Cmd+/). */
export function initHelp(page: Page): Help {
  const root = page.getByTestId('help-dialog');
  const locators = {
    buttons: {
      close: page.getByTestId('help-close'),
    },
    version: page.getByTestId('app-version'),
  };
  const interactions = {
    close: async () => {
      await locators.buttons.close.click();
    },
    openByKeyboard: async () => {
      await page.keyboard.press('ControlOrMeta+/');
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
