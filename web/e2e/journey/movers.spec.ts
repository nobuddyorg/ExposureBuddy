import { expect, test } from '../fixture';

import { listBurst } from '../helpers';

test.use({ locale: 'en-GB' });

const BURST = 'burst-street';
const FRAME_COUNT = 12;
// Twelve frames, then the model (about 17 MB from the local server) and every frame through it in headless software GL.
const MOVERS_TIMEOUT = 240_000;

test.describe('what moves between the shots', () => {
  for (const mode of ['remove', 'blur'] as const) {
    test(`is off at first, and a burst run with ${mode} on still ends in a result or says clearly that the browser cannot look`, async ({
      on,
      page,
    }) => {
      test.setTimeout(MOVERS_TIMEOUT * 2);
      const app = on(page);
      await app.picker.do.open();
      await app.picker.do.addPhotos(listBurst(BURST));
      await expect(app.picker.locators.thumbnails).toHaveCount(FRAME_COUNT);
      await expect(app.picker.locators.movers).toHaveValue('off');

      await app.picker.do.selectQuality('low');
      await app.picker.do.selectMovers(mode);
      await app.picker.do.combine();
      await expect(app.progress()).toBeVisible();

      await expect(app.result().or(app.pipelineError())).toBeVisible({
        timeout: MOVERS_TIMEOUT,
      });
      if (await app.pipelineError().isVisible()) {
        // WebKit has no WebGL in a worker: the error names the cause and no run is half-finished.
        await expect(app.pipelineError()).toContainText(
          'WebGL inside a Web Worker',
        );
        return;
      }
      await expect(app.result.locators.stats).toContainText(
        String(FRAME_COUNT),
      );
      await expect(app.result.locators.canvas).toBeVisible();
    });
  }
});
