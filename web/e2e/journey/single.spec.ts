import { expect, test } from '../fixture';

import { fixturePath } from '../helpers';

test.use({ locale: 'en-GB' });

// The first run downloads about 17 MB from the local server and starts the Wasm runtime on a CI runner.
const SINGLE_TIMEOUT = 120_000;
const CACHE_PREFIX = 'exposurebuddy-ml';

type Page = import('@playwright/test').Page;

type App = ReturnType<typeof import('../pages').createPageTree>;

/** The picker with exactly one photo chosen. */
async function openWith(app: App, photo: string) {
  await app.picker.do.open();
  await app.picker.do.addPhotos([fixturePath(photo)]);
  await expect(app.picker.locators.thumbnails).toHaveCount(1);
}

function mlCachedUrls(page: Page) {
  return page.evaluate(async (prefix) => {
    const names = (await caches.keys()).filter((name) =>
      name.startsWith(prefix),
    );
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls;
  }, CACHE_PREFIX);
}

test.describe('one photo, no burst', () => {
  test('a person becomes a ghost, the effect and its strength can be changed, and the original is one tap away', async ({
    on,
    page,
  }) => {
    test.setTimeout(SINGLE_TIMEOUT * 2);
    const app = on(page);
    await openWith(app, 'single/person.png');
    await expect(app.picker.locators.buttons.singlePhoto).toBeEnabled();
    // A burst needs two photos; the single-photo mode is what one photo gets instead.
    await expect(app.picker.locators.buttons.combine).toBeDisabled();

    await app.picker.do.singlePhoto();
    await expect(app.progress()).toBeVisible();
    await expect(app.result.locators.canvas).toBeVisible({
      timeout: SINGLE_TIMEOUT,
    });
    await expect(app.result.locators.stats).toHaveText('640 × 480 px');

    const motion = await app.result.do.canvasDigest();
    await app.result.do.selectEffect('smoke');
    const smoke = await app.result.do.canvasDigest();
    expect(smoke).not.toBe(motion);
    await app.result.do.selectEffect('liquid');
    await expect(app.result.locators.angle).toHaveCount(0);
    await app.result.do.setStrength(1);
    await app.result.do.selectEffect('smear');
    await expect(app.result.locators.angle).toBeVisible();

    // The people are the only thing that changed: the corner of the photo is the street, untouched.
    const effect = await app.result.do.canvasPixels();
    const beforeCompare = await app.result.do.canvasDigest();
    await app.result.do.toggleCompare();
    await expect
      .poll(() => app.result.do.canvasDigest(), { timeout: 15_000 })
      .not.toBe(beforeCompare);
    const original = await app.result.do.canvasPixels();
    expect(original.width).toBe(effect.width);
    const corner = (image: typeof original) =>
      Array.from(image.data.slice(0, 4 * 40));
    expect(corner(effect)).toEqual(corner(original));
    const changed = effect.data.some(
      (value, index) => value !== original.data[index],
    );
    expect(changed).toBe(true);

    await app.result.do.toggleCompare();
    const download = await app.result.do.download();
    expect(download.suggestedFilename()).toMatch(/\.jpe?g$/);

    await app.result.do.startOver();
    await expect(app.picker()).toBeVisible();
  });

  test('a photo without people ends on the error screen, with the cause, and nothing is returned unchanged', async ({
    on,
    page,
  }) => {
    test.setTimeout(SINGLE_TIMEOUT * 2);
    const app = on(page);
    await openWith(app, 'single/empty.png');
    await app.picker.do.singlePhoto();

    await expect(app.pipelineError()).toBeVisible({ timeout: SINGLE_TIMEOUT });
    await expect(app.pipelineError()).toContainText(
      'No people were found in this photo',
    );
    await app.pipelineError.do.openDiagnostics();
    await expect(app.pipelineError.locators.diagnosticsText).toContainText(
      'Failure: no_people',
    );
    await expect(app.pipelineError.locators.diagnosticsText).not.toContainText(
      'empty.png',
    );
    await expect(app.result.locators.canvas).toHaveCount(0);

    await app.pipelineError.do.retry();
    await expect(app.picker()).toBeVisible();
  });

  test('the photo stays on the device: every request goes to the app itself, and none carries a body', async ({
    on,
    page,
    baseURL,
  }) => {
    test.setTimeout(SINGLE_TIMEOUT * 2);
    const requests: { url: string; method: string; body: string | null }[] = [];
    page.on('request', (request) =>
      requests.push({
        url: request.url(),
        method: request.method(),
        body: request.postData(),
      }),
    );
    const app = on(page);
    await openWith(app, 'single/person.png');
    await app.picker.do.singlePhoto();
    await expect(app.result.locators.canvas).toBeVisible({
      timeout: SINGLE_TIMEOUT,
    });

    const origin = new URL(baseURL ?? '').origin;
    const foreign = requests.filter(
      (request) =>
        !request.url.startsWith(origin) &&
        !request.url.startsWith('blob:') &&
        !request.url.startsWith('data:'),
    );
    expect(foreign, 'requests to another origin').toEqual([]);
    expect(
      requests.filter(
        (request) => request.method !== 'GET' || request.body !== null,
      ),
    ).toEqual([]);
    // The model and the runtime came from the app's own ml/ folder.
    expect(
      requests.some((request) => request.url.endsWith('/ml/deeplab_v3.tflite')),
    ).toBe(true);
    expect(
      requests.some((request) =>
        request.url.endsWith('/ml/vision_wasm_internal.wasm'),
      ),
    ).toBe(true);
  });

  test('works offline once the model has been loaded', async ({
    on,
    page,
    context,
  }) => {
    test.setTimeout(SINGLE_TIMEOUT * 3);
    const app = on(page);
    await openWith(app, 'single/person.png');
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
    );
    await app.picker.do.singlePhoto();
    await expect(app.result.locators.canvas).toBeVisible({
      timeout: SINGLE_TIMEOUT,
    });
    await expect
      .poll(
        async () =>
          (await mlCachedUrls(page)).map((url) => url.split('/').pop()).sort(),
        { timeout: 15_000 },
      )
      .toEqual([
        'deeplab_v3.tflite',
        'vision_wasm_internal.js',
        'vision_wasm_internal.wasm',
      ]);

    await context.setOffline(true);
    await page.reload();
    await expect(app.picker.locators.dropzone).toBeVisible();
    await app.picker.do.addPhotos([fixturePath('single/person.png')]);
    await app.picker.do.singlePhoto();
    await expect(app.result.locators.canvas).toBeVisible({
      timeout: SINGLE_TIMEOUT,
    });
    await context.setOffline(false);
  });
});

test.describe('one photo, in German', () => {
  test.use({ locale: 'de-DE' });

  test('the picker offers the mode in German', async ({ on, page }) => {
    const app = on(page);
    await openWith(app, 'single/person.png');
    await expect(app.picker.locators.buttons.singlePhoto).toHaveText(
      'Menschen in Geister verwandeln',
    );
  });
});
