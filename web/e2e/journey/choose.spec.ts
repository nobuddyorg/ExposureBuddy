import { expect, test } from '../fixture';

import {
  comparisonWindow,
  locateCrop,
  meanAbsoluteDifference,
  readBurstMeta,
  readFixturePng,
  renderThroughTransform,
  type BurstMeta,
} from '../burst';
import type { DecodedPng } from '../png';
import { listBurst } from '../helpers';

test.use({ locale: 'en-GB' });

const BURST = 'burst-street';
const PIPELINE_TIMEOUT = 120_000;
// Mean absolute RGB difference, 0–255, between the road band with ghosts off and the scene as one frame saw it.
const MAX_STILL_DIFFERENCE = 12;

/** How far the road band of `still` is from the person-free scene framed as burst frame `frame` saw it. */
function differenceFromFrame(
  still: DecodedPng,
  meta: BurstMeta,
  frame: number,
): number {
  const { transform, gain } = meta.frames[frame];
  const expected = renderThroughTransform(
    readFixturePng(`${BURST}/background.png`),
    transform,
    gain,
  );
  const crop = locateCrop(still, expected);
  const band = comparisonWindow(
    { ...meta, referenceIndex: frame },
    crop,
    still,
  );
  return meanAbsoluteDifference(
    still,
    band.cropWindow,
    expected,
    band.frameWindow,
    band.size,
  );
}

test.describe('choosing the photos', () => {
  test('a removed photo stays out and the chosen reference sets the framing', async ({
    on,
    page,
  }) => {
    test.setTimeout(PIPELINE_TIMEOUT * 2);
    const app = on(page);
    await app.picker.do.open();
    await app.picker.do.addPhotos(listBurst(BURST).slice(0, 6));
    await expect(app.picker.locators.tiles).toHaveCount(6);
    // The middle of six is the third.
    await expect(app.picker.locators.referenceTile).toHaveCount(1);
    await expect(app.picker.locators.tiles.nth(2)).toHaveAttribute(
      'data-reference',
      'true',
    );

    await app.picker.do.removePhoto(5);
    await expect(app.picker.locators.count).toHaveText('5 photos');
    await app.picker.do.chooseReference(0);
    await expect(app.picker.locators.tiles.nth(0)).toHaveAttribute(
      'data-reference',
      'true',
    );
    await expect(app.picker.locators.referenceTile).toHaveCount(1);

    await app.picker.do.selectQuality('low');
    await app.picker.do.combine();
    await expect(app.result()).toBeVisible({ timeout: PIPELINE_TIMEOUT });
    await expect(app.result.locators.stats).toContainText('of 5');

    await app.result.do.setSlider('glow', 0);
    await app.result.do.setSlider('ghost', 0);
    const still = await app.result.do.canvasPixels();
    const meta = readBurstMeta(BURST);
    const chosen = differenceFromFrame(still, meta, 0);
    const middle = differenceFromFrame(still, meta, 2);
    expect(chosen, 'framed as the chosen photo').toBeLessThan(
      MAX_STILL_DIFFERENCE,
    );
    // Aligned to the middle photo instead, the band would sit several pixels off: about 11 against 2 here.
    expect(
      chosen,
      'closer to the chosen photo than to the middle one',
    ).toBeLessThan(middle / 2);
  });
});
