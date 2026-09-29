import { expect, test } from '../fixture';

const GERMAN_TITLE = 'Fotoserie auswählen';
const ENGLISH_TITLE = 'Pick your burst';

// Language is decided client-side; a wrong <html lang> mispronounces the page with no visible symptom.
test.describe('the language a page arrives in', () => {
  test.describe('from a German browser', () => {
    test.use({ locale: 'de-DE' });

    test('is German', async ({ on, page }) => {
      await on(page).picker.do.open();
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(on(page).picker()).toContainText(GERMAN_TITLE);
    });

    test('describes the page in the language it is showing', async ({
      page,
    }) => {
      await page.goto('', { waitUntil: 'networkidle' });
      const description = page.locator('meta[name="description"]');
      await expect(description).toHaveAttribute('content', /Browser/);
    });
  });

  test.describe('from an English browser', () => {
    test.use({ locale: 'en-GB' });

    test('is English', async ({ on, page }) => {
      await on(page).picker.do.open();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(on(page).picker()).toContainText(ENGLISH_TITLE);
    });

    test('lets a stored choice overrule the browser', async ({ on, page }) => {
      await page.addInitScript(() => localStorage.setItem('lang', 'de'));
      await on(page).picker.do.open();
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(on(page).picker()).toContainText(GERMAN_TITLE);
    });

    test('the toggle switches the language, <html lang> follows, and the choice survives a reload', async ({
      on,
      page,
    }) => {
      const app = on(page);
      await app.picker.do.open();
      await app.header.do.toggleLanguage();
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(app.picker()).toContainText(GERMAN_TITLE);

      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(app.picker()).toContainText(GERMAN_TITLE);

      await app.header.do.toggleLanguage();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(app.picker()).toContainText(ENGLISH_TITLE);
    });
  });

  test.describe('from a browser in a language it does not speak', () => {
    test.use({ locale: 'ja-JP' });

    test('falls back to English, with every string translated', async ({
      on,
      page,
    }) => {
      await on(page).picker.do.open();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(on(page).picker()).toContainText(ENGLISH_TITLE);
      // A raw dictionary key on screen means a translation is missing.
      await expect(page.locator('body')).not.toContainText(
        /\b(picker|header|footer|page)\.\w+/,
      );
    });
  });
});
