import { expect, test } from '../fixture';

import { fixturePath, listBurst } from '../helpers';

test.use({ locale: 'en-GB' });

const PIPELINE_TIMEOUT = 120_000;

test.describe('when the burst is not a burst', () => {
  test('two unrelated scenes end on the error screen, and retry goes back to the picker', async ({
    on,
    page,
  }) => {
    test.setTimeout(PIPELINE_TIMEOUT * 2);
    const app = on(page);
    await app.picker.do.open();
    await app.picker.do.addPhotos([
      fixturePath('unrelated/scene-a.png'),
      fixturePath('unrelated/scene-b.png'),
    ]);
    await expect(app.picker.locators.thumbnails).toHaveCount(2);
    await app.picker.do.selectQuality('low');
    await app.picker.do.combine();

    await expect(app.pipelineError()).toBeVisible({
      timeout: PIPELINE_TIMEOUT,
    });
    await expect(app.pipelineError()).toContainText('lined up');

    // The report for a bug: what failed and where, never a file name.
    await app.pipelineError.do.openDiagnostics();
    await expect(app.pipelineError.locators.diagnosticsText).toContainText(
      'Failure: too_few_aligned (1)',
    );
    await expect(app.pipelineError.locators.diagnosticsText).toContainText(
      'Run: 2 photos',
    );
    await expect(app.pipelineError.locators.diagnosticsText).not.toContainText(
      'scene-a',
    );
    // Whether the clipboard may be written depends on the engine and its permissions; either way the visitor is told.
    await app.pipelineError.do.copyDiagnostics();
    await expect(app.pipelineError.locators.copyStatus).toHaveText(
      /^(Copied\. Paste it into a bug report\.|Could not copy\. Open Diagnostic info and copy the text by hand\.)$/,
    );

    await app.pipelineError.do.retry();
    await expect(app.picker()).toBeVisible();
  });

  test('a file that is not an image is refused with a notice', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.picker.do.open();
    await app.picker.do.addPhotos([fixturePath('not-an-image.txt')]);

    await expect(app.picker.locators.notice).toBeVisible();
    await expect(app.picker.locators.notice).toContainText('not-an-image.txt');
    await expect(app.picker.locators.thumbnails).toHaveCount(0);
  });

  test('cancelling while combining goes back to the picker', async ({
    on,
    page,
  }) => {
    test.setTimeout(PIPELINE_TIMEOUT * 2);
    const app = on(page);
    await app.picker.do.open();
    await app.picker.do.addPhotos(listBurst('burst-street'));
    await app.picker.do.selectQuality('high');
    await app.picker.do.combine();

    // A 640 px burst is never upscaled, so even 'high' can finish before the click lands, and a click the unmounting
    // Cancel button no longer takes lands on the result screen: the screen that shows, not the click, says which it was.
    await app.progress.do.tryCancel();
    await expect(app.picker().or(app.result())).toBeVisible({
      timeout: PIPELINE_TIMEOUT,
    });
    if (await app.picker().isVisible()) {
      await expect(app.result()).toBeHidden();
    }
  });
});
