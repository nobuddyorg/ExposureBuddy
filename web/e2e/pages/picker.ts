import { expect, type Locator, type Page } from '@playwright/test';

type Quality = 'low' | 'standard' | 'high' | 'original';

interface Picker {
  (): Locator;
  do: {
    addPhotos(paths: readonly string[]): Promise<void>;
    chooseReference(index: number): Promise<void>;
    clear(): Promise<void>;
    combine(): Promise<void>;
    open(): Promise<void>;
    removePhoto(index: number): Promise<void>;
    selectQuality(quality: Quality): Promise<void>;
    thumbnailNaturalWidth(index: number): Promise<number>;
  };
  locators: {
    buttons: {
      clear: Locator;
      combine: Locator;
      pick: Locator;
    };
    count: Locator;
    dropzone: Locator;
    input: Locator;
    notice: Locator;
    quality: Locator;
    referenceTile: Locator;
    resultSize: Locator;
    thumbnails: Locator;
    tiles: Locator;
  };
}

/** The first screen: the burst is chosen here and the pipeline started. */
export function initPicker(page: Page): Picker {
  const root = page
    .getByRole('main')
    .filter({ has: page.getByTestId('photo-dropzone') });
  const locators = {
    buttons: {
      clear: page.getByTestId('clear-photos'),
      combine: page.getByTestId('combine'),
      pick: page.getByTestId('pick-photos'),
    },
    count: page.getByTestId('photo-count'),
    dropzone: page.getByTestId('photo-dropzone'),
    input: page.getByTestId('photo-input'),
    notice: page.getByTestId('picker-notice'),
    quality: page.getByTestId('quality-select'),
    referenceTile: page
      .getByTestId('photo-tile')
      .and(page.locator('[data-reference="true"]')),
    resultSize: page.getByTestId('result-size'),
    thumbnails: page.getByTestId('photo-thumb'),
    tiles: page.getByTestId('photo-tile'),
  };
  const interactions = {
    // Straight into the hidden file input: the native chooser is not scriptable.
    addPhotos: async (paths: readonly string[]) => {
      await locators.input.setInputFiles([...paths]);
    },
    chooseReference: async (index: number) => {
      await locators.tiles.nth(index).getByTestId('choose-reference').click();
    },
    clear: async () => {
      await locators.buttons.clear.click();
    },
    // Returns when the click landed, not when the pipeline finished: the spec watches progress and result.
    combine: async () => {
      await locators.buttons.combine.click();
    },
    open: async () => {
      await page.goto('', { waitUntil: 'networkidle' });
      await expect(locators.dropzone).toBeVisible();
    },
    removePhoto: async (index: number) => {
      await locators.tiles.nth(index).getByTestId('remove-photo').click();
    },
    selectQuality: async (quality: Quality) => {
      await locators.quality.selectOption(quality);
    },
    // A thumbnail that decoded has a natural width; a broken image has 0.
    thumbnailNaturalWidth: (index: number) =>
      locators.thumbnails
        .nth(index)
        .evaluate((element) =>
          element instanceof HTMLImageElement
            ? element.naturalWidth
            : (element.querySelector('img')?.naturalWidth ?? 0),
        ),
  };
  return Object.assign(() => root, { locators, do: interactions });
}
