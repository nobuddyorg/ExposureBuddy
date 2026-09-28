import { type Locator, type Page } from '@playwright/test';

interface PipelineError {
  (): Locator;
  do: {
    retry(): Promise<void>;
  };
  locators: {
    buttons: {
      retry: Locator;
    };
  };
}

/** The screen a failed pipeline ends on, with its cause and a way back. */
export function initPipelineError(page: Page): PipelineError {
  const root = page.getByTestId('pipeline-error');
  const locators = {
    buttons: {
      retry: page.getByTestId('retry'),
    },
  };
  const interactions = {
    retry: async () => {
      await locators.buttons.retry.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
