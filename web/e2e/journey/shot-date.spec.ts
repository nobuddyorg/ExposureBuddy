import { readFileSync, writeFileSync } from 'node:fs';

import { expect, test } from '../fixture';

import { listBurst } from '../helpers';
import { jpegFromPng, withDateTimeOriginal } from '../jpeg';

test.use({ locale: 'en-GB' });

const PIPELINE_TIMEOUT = 120_000;
const TAKEN = '2025:07:14 21:30:05';

test.describe('the shooting date', () => {
  test('the saved image carries the date the reference photo was taken', async ({
    on,
    page,
  }, testInfo) => {
    test.setTimeout(PIPELINE_TIMEOUT * 2);
    const app = on(page);
    await app.picker.do.open();
    const paths = await Promise.all(
      listBurst('burst-street')
        .slice(0, 3)
        .map(async (png, index) => {
          const jpeg = await jpegFromPng(page, png);
          // Only the reference, the middle photo, is dated: the date has to come from that one.
          const photo = index === 1 ? withDateTimeOriginal(jpeg, TAKEN) : jpeg;
          const path = testInfo.outputPath(`photo-${index}.jpg`);
          writeFileSync(path, photo);
          return path;
        }),
    );
    await app.picker.do.addPhotos(paths);
    await app.picker.do.selectQuality('low');
    await app.picker.do.combine();
    await expect(app.result()).toBeVisible({ timeout: PIPELINE_TIMEOUT });

    const download = await app.result.do.download();
    const saved = readFileSync(await download.path());
    expect([saved[0], saved[1]], 'JPEG start-of-image marker').toEqual([
      0xff, 0xd8,
    ]);
    expect(saved.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(true);
    expect(saved.includes(Buffer.from(TAKEN, 'latin1'))).toBe(true);
  });
});
