import { expect, test } from '../fixture';

import {
  leaveIsGuarded,
  listBurst,
  recordWakeLocks,
  wakeLocks,
} from '../helpers';

test.use({ locale: 'en-GB' });

const PIPELINE_TIMEOUT = 120_000;
// A few frames are enough to reach the result; the journey spec covers the full burst.
const FRAME_COUNT = 4;

test.describe('keeping a run and its result', () => {
  test('holds the screen on while combining and guards an unsaved result', async ({
    on,
    page,
  }) => {
    test.setTimeout(PIPELINE_TIMEOUT * 2);
    await recordWakeLocks(page);
    const app = on(page);
    await app.picker.do.open();
    expect(await leaveIsGuarded(page), 'picker').toBe(false);

    await app.picker.do.addPhotos(
      listBurst('burst-street').slice(0, FRAME_COUNT),
    );
    await app.picker.do.selectQuality('low');
    await app.picker.do.combine();
    await expect(app.result()).toBeVisible({ timeout: PIPELINE_TIMEOUT });

    // Only a running pipeline asks for the lock, and the result screen gives it back.
    const locks = await wakeLocks(page);
    expect(locks.requested, 'locks asked for').toBeGreaterThanOrEqual(1);
    expect(locks.held, 'locks still held').toBe(0);

    expect(await leaveIsGuarded(page), 'unsaved result').toBe(true);
    await app.result.do.download();
    await expect
      .poll(() => leaveIsGuarded(page), { message: 'saved result' })
      .toBe(false);
  });
});
