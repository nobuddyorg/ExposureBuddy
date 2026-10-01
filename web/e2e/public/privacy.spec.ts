import { expect, test } from '../fixture';

test.describe('the privacy page', () => {
  test.describe('in English', () => {
    test.use({ locale: 'en-GB' });

    test('opens from the footer, says what stays on the device, and leads back to the app', async ({
      on,
      page,
    }) => {
      const app = on(page);
      await app.picker.do.open();
      await app.privacy.do.openFromFooter();
      await expect(app.privacy.locators.heading).toHaveText('Privacy');
      await expect(page).toHaveURL(/\/privacy\/$/);
      await expect(app.privacy()).toContainText('no cookies');
      await expect(app.privacy()).toContainText('GitHub Pages');

      await app.privacy.do.back();
      await expect(app.picker()).toBeVisible();
    });

    test('opens on its own address, as a bookmark or a shared link would', async ({
      on,
      page,
    }) => {
      await page.goto('privacy/', { waitUntil: 'networkidle' });
      await expect(on(page).privacy.locators.heading).toHaveText('Privacy');
    });
  });

  test.describe('in German', () => {
    test.use({ locale: 'de-DE' });

    test('speaks the visitor’s language', async ({ on, page }) => {
      const app = on(page);
      await app.picker.do.open();
      await app.privacy.do.openFromFooter();
      await expect(app.privacy.locators.heading).toHaveText('Datenschutz');
      await expect(app.privacy()).toContainText('keine Cookies');
    });
  });
});
