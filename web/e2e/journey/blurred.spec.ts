import { expect, test } from '../fixture';

import { fixturePath, listBurst } from '../helpers';

test.use({ locale: 'en-GB' });

const PIPELINE_TIMEOUT = 120_000;

test.describe('a blurred photo in the burst', () => {
  test('is aligned, then left out and reported as blurred', async ({
    on,
    page,
  }) => {
    test.setTimeout(PIPELINE_TIMEOUT * 2);
    const app = on(page);
    await app.picker.do.open();
    await app.picker.do.addPhotos([
      ...listBurst('burst-street').slice(0, 5),
      fixturePath('shaken/frame-07-blurred.png'),
    ]);
    await expect(app.picker.locators.tiles).toHaveCount(6);
    await app.picker.do.selectQuality('low');
    await app.picker.do.combine();

    await expect(app.result()).toBeVisible({ timeout: PIPELINE_TIMEOUT });
    await expect(app.result.locators.stats).toContainText('5 of 6');
    await expect(app.result.locators.blurred).toHaveText(
      '1 photo was blurred, so it was left out rather than soften the result.',
    );
    await expect(app.result.locators.skipped).toHaveCount(0);
  });
});
