import { type Locator, type Page } from '@playwright/test';

interface Progress {
  (): Locator;
  do: {
    cancel(): Promise<void>;
    tryCancel(): Promise<boolean>;
  };
  locators: {
    bar: Locator;
    buttons: {
      cancel: Locator;
    };
    frameStatuses: Locator;
    stage: Locator;
  };
}

/** The screen shown while the pipeline runs. */
export function initProgress(page: Page): Progress {
  const root = page.getByTestId('progress');
  const locators = {
    bar: root.getByTestId('progress-bar'),
    buttons: {
      cancel: root.getByTestId('cancel'),
    },
    frameStatuses: root.getByTestId('frame-status'),
    stage: root.getByTestId('progress-stage'),
  };
  const interactions = {
    cancel: async () => {
      await locators.buttons.cancel.click();
    },
    // True when the click landed while the pipeline still ran; false when the screen went away first.
    // The button unmounts the moment the pipeline finishes, so a click that lands is a cancellation and one that cannot land is not.
    tryCancel: () =>
      locators.buttons.cancel.click({ timeout: 5_000 }).then(
        () => true,
        () => false,
      ),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
