import { type Locator, type Page } from '@playwright/test';

interface PipelineError {
  (): Locator;
  do: {
    copyDiagnostics(): Promise<void>;
    openDiagnostics(): Promise<void>;
    retry(): Promise<void>;
  };
  locators: {
    buttons: {
      copyDiagnostics: Locator;
      diagnostics: Locator;
      retry: Locator;
    };
    copyStatus: Locator;
    diagnosticsText: Locator;
  };
}

/** The screen a failed pipeline ends on, with its cause and a way back. */
export function initPipelineError(page: Page): PipelineError {
  const root = page.getByTestId('pipeline-error');
  const locators = {
    buttons: {
      copyDiagnostics: page.getByTestId('copy-diagnostics'),
      diagnostics: page.getByTestId('diagnostics-toggle'),
      retry: page.getByTestId('retry'),
    },
    copyStatus: page.getByTestId('copy-status'),
    diagnosticsText: page.getByTestId('diagnostics-text'),
  };
  const interactions = {
    copyDiagnostics: async () => {
      await locators.buttons.copyDiagnostics.click();
    },
    openDiagnostics: async () => {
      await locators.buttons.diagnostics.click();
    },
    retry: async () => {
      await locators.buttons.retry.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
