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
    tryCancel: () => {
      const clicked = locators.buttons.cancel.click({ timeout: 5_000 }).then(
        () => true,
        () => false,
      );
      const finished = root.waitFor({ state: 'hidden', timeout: 60_000 }).then(
        () => false,
        () => false,
      );
      return Promise.race([clicked, finished]);
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
