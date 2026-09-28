import { expect, test } from '../fixture';

import { expectNoSeriousA11yViolations } from '../axe';
import { listBurst } from '../helpers';

// Pinned, so a locale switch is not scanned as a second accessibility state.
test.use({ locale: 'en-GB' });

test.describe('accessibility', () => {
  test('the picker has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    await on(page).picker.do.open();
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('the picker with photos chosen has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.picker.do.open();
    await app.picker.do.addPhotos(listBurst('burst-tiny'));
    await expect(app.picker.locators.thumbnails).toHaveCount(3);
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('the open help dialog has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.picker.do.open();
    await app.header.do.openHelp();
    await expect(app.help()).toBeVisible();
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('the result screen has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    const app = on(page);
    await app.picker.do.open();
    await app.picker.do.addPhotos(listBurst('burst-tiny'));
    await app.picker.do.selectQuality('low');
    await app.picker.do.combine();
    await expect(app.result()).toBeVisible({ timeout: 60_000 });
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  // Opened directly: the local harness answers an unmatched path with an error template of its own.
  test('the not-found page has no serious or critical violations', async ({
    on,
    page,
  }, testInfo) => {
    await on(page).notFound.do.open();
    await expectNoSeriousA11yViolations(page, testInfo);
  });
});
