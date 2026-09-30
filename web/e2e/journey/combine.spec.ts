import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixture';

import {
  comparisonWindow,
  locateCrop,
  meanAbsoluteDifference,
  readBurstMeta,
  readFixturePng,
  renderThroughTransform,
} from '../burst';
import {
  collectPageProblems,
  expectNoPageProblems,
  listBurst,
  mainLandmark,
} from '../helpers';

test.use({ locale: 'en-GB' });

const BURST = 'burst-street';
const FRAME_COUNT = 12;
// Twelve 640 px frames through ORB, RANSAC and the stack, on a CI runner's worker pool.
const PIPELINE_TIMEOUT = 120_000;
// Mean absolute RGB difference, 0–255, between the road band with ghosts off and the person-free scene.
const MAX_STILL_DIFFERENCE = 12;
// How much more the band must differ once the walker's ghosts are back at full strength.
const MIN_GHOST_GAIN = 1;
// Tailwind's lg breakpoint, where the result screen goes two-column.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('the whole journey', () => {
  test('combines the street burst into a long exposure', async ({
    on,
    page,
  }) => {
    test.setTimeout(PIPELINE_TIMEOUT * 2);
    const problems = collectPageProblems(page);
    const app = on(page);

    await app.picker.do.open();
    await app.picker.do.addPhotos(listBurst(BURST));
    await expect(app.picker.locators.thumbnails).toHaveCount(FRAME_COUNT);
    await expect(app.picker.locators.count).toContainText(String(FRAME_COUNT));
    // WebKit decodes a blob: thumbnail a moment after it is in the DOM.
    await expect
      .poll(() => app.picker.do.thumbnailNaturalWidth(0))
      .toBeGreaterThan(0);

    await app.picker.do.selectQuality('low');
    await app.picker.do.combine();

    await expect(app.progress()).toBeVisible();
    // The combine button is gone; a keyboard user must not be dropped onto <body>.
    await expect(mainLandmark(page)).toBeFocused();
    await expect(app.progress.locators.stage).not.toBeEmpty();
    await expect(app.progress.locators.frameStatuses).toHaveCount(FRAME_COUNT);

    await expect(app.result()).toBeVisible({ timeout: PIPELINE_TIMEOUT });
    const stats = (await app.result.locators.stats.textContent()) ?? '';
    const [, aligned, total] = /(\d+)\s+of\s+(\d+)/.exec(stats) ?? [];
    expect(Number(total), stats).toBe(FRAME_COUNT);
    expect(Number(aligned), stats).toBeGreaterThanOrEqual(FRAME_COUNT - 2);

    // Correctness: with ghosts off, the road band is the person-free scene as the reference frame saw it.
    const meta = readBurstMeta(BURST);
    const reference = meta.frames[meta.referenceIndex];
    const expected = renderThroughTransform(
      readFixturePng(`${BURST}/background.png`),
      reference.transform,
      reference.gain,
    );
    await app.result.do.setSlider('glow', 0);
    await app.result.do.setSlider('ghost', 0);
    const still = await app.result.do.canvasPixels();
    const crop = locateCrop(still, expected);
    const band = comparisonWindow(meta, crop, still);
    expect(band.size.width, 'road band inside the crop').toBeGreaterThan(100);
    const ghostsOff = meanAbsoluteDifference(
      still,
      band.cropWindow,
      expected,
      band.frameWindow,
      band.size,
    );
    expect(ghostsOff, 'road band vs the scene, ghosts off').toBeLessThan(
      MAX_STILL_DIFFERENCE,
    );

    await app.result.do.setSlider('ghost', 1);
    const ghosted = await app.result.do.canvasPixels();
    const ghostsOn = meanAbsoluteDifference(
      ghosted,
      band.cropWindow,
      expected,
      band.frameWindow,
      band.size,
    );
    expect(ghostsOn, 'road band vs the scene, ghosts on').toBeGreaterThan(
      ghostsOff + MIN_GHOST_GAIN,
    );

    // Every photo lined up, so nothing is reported as left out.
    await expect(app.result.locators.skipped).toHaveCount(0);
    await expectSlidersBehindTheBarOnAPhone(page, app.result);
    await expectLayoutFor(page, app.result.locators);

    const beforeBlur = await app.result.do.canvasDigest();
    await app.result.do.setSlider('blur', 1);
    expect(await app.result.do.canvasDigest()).not.toBe(beforeBlur);

    const composite = await app.result.do.canvasDigest();
    await app.result.do.toggleCompare();
    await expect.poll(() => app.result.do.canvasDigest()).not.toBe(composite);
    await app.result.do.toggleCompare();
    await expect.poll(() => app.result.do.canvasDigest()).toBe(composite);

    await app.result.do.holdCompare();
    await expect.poll(() => app.result.do.canvasDigest()).not.toBe(composite);
    await app.result.do.releaseCompare();
    await expect.poll(() => app.result.do.canvasDigest()).toBe(composite);

    const download = await app.result.do.download();
    expect(download.suggestedFilename()).toMatch(/\.jpg$/);
    const bytes = readFileSync(await download.path());
    expect([bytes[0], bytes[1]], 'JPEG start-of-image marker').toEqual([
      0xff, 0xd8,
    ]);

    await app.result.do.startOver();
    await expect(app.picker()).toBeVisible();
    await expect(app.picker.locators.thumbnails).toHaveCount(0);

    expectNoPageProblems(problems);
  });
});

/** Beside the sliders on a wide screen, above them on a phone: the layout is part of the journey. */
async function expectLayoutFor(
  page: Page,
  locators: { canvas: Locator; sliders: { ghost: Locator } },
) {
  const canvas = await locators.canvas.boundingBox();
  const slider = await locators.sliders.ghost.boundingBox();
  const viewport = page.viewportSize();
  if (!canvas || !slider || !viewport) throw new Error('no layout to measure');
  if (viewport.width >= DESKTOP_MIN_WIDTH) {
    expect(
      canvas.x + canvas.width,
      'image left of the sliders',
    ).toBeLessThanOrEqual(slider.x);
  } else {
    expect(
      canvas.y + canvas.height,
      'image above the sliders',
    ).toBeLessThanOrEqual(slider.y);
  }
}

/** A phone opens on the image and Save with the sliders folded away; the bar shows them. A desktop shows them at once. */
async function expectSlidersBehindTheBarOnAPhone(
  page: Page,
  result: {
    locators: { sliders: { ghost: Locator }; buttons: { adjust: Locator } };
    do: { openControls(): Promise<void> };
  },
) {
  const phone = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
  if (phone) {
    await expect(result.locators.sliders.ghost).toBeHidden();
    await expect(result.locators.buttons.adjust).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }
  await result.do.openControls();
  await expect(result.locators.sliders.ghost).toBeVisible();
}
