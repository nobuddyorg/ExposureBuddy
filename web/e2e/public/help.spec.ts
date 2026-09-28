import { expect, test } from '../fixture';

test.use({ locale: 'en-GB' });

test.describe('help', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).picker.do.open();
  });

  test('opens from the header, closes with Escape, and hands focus back to the button', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.header.do.openHelp();
    await expect(app.help()).toBeVisible();
    await expect(app.help()).toContainText('How ExposureBuddy works');

    await page.keyboard.press('Escape');
    await expect(app.help()).toBeHidden();
    await expect(app.header.locators.buttons.openHelp).toBeFocused();
  });

  test('opens with Ctrl+/ (Cmd+/) from anywhere on the page, and its close button closes it', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.help.do.openByKeyboard();
    await expect(app.help()).toBeVisible();

    await app.help.do.close();
    await expect(app.help()).toBeHidden();
    // The picker is untouched underneath.
    await expect(app.picker.locators.dropzone).toBeVisible();
  });
});
