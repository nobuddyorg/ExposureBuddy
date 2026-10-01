import { expect, test } from '../fixture';

import { listBurst } from '../helpers';

test.use({ locale: 'en-GB' });

const PIPELINE_TIMEOUT = 120_000;

test.describe('the output size', () => {
  test('the original size says what it comes out at and combines at the photos’ own size', async ({
    on,
    page,
  }) => {
    test.setTimeout(PIPELINE_TIMEOUT * 2);
    const app = on(page);
    await app.picker.do.open();
    await app.picker.do.addPhotos(listBurst('burst-street').slice(0, 4));
    await app.picker.do.selectQuality('original');
    await expect(app.picker.locators.resultSize).toHaveText(
      'Comes out up to 640 × 480 px',
    );
    await app.picker.do.combine();
    await expect(app.result()).toBeVisible({ timeout: PIPELINE_TIMEOUT });
    // The crop to what every photo covers can only take a little off the photos' own size.
    const stats = (await app.result.locators.stats.textContent()) ?? '';
    const [, width, height] = /(\d+)\s*×\s*(\d+)/.exec(stats) ?? [];
    expect(Number(width)).toBeGreaterThan(560);
    expect(Number(width)).toBeLessThanOrEqual(640);
    expect(Number(height)).toBeLessThanOrEqual(480);
  });
});
