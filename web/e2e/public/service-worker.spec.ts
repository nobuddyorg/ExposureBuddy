import { expect, test } from '../fixture';

import {
  collectPageProblems,
  expectNoPageProblems,
  listBurst,
} from '../helpers';

// What a unit test cannot reach from sw.js's source: registration, scope, cache, offline.
test.use({ locale: 'en-GB' });

type Page = import('@playwright/test').Page;

const CACHE_PREFIX = 'exposurebuddy-';
// Three 320 px frames through the pipeline at low quality, on a CI runner's worker pool.
const TINY_PIPELINE_TIMEOUT = 45_000;
// About 1 MB from the local server, with room for a slow CI runner.
const PRECACHE_TIMEOUT = 15_000;

/** Controlling, not merely registered: an uncontrolled page's requests never reach the fetch handler. */
async function waitForController(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** The cache of the build that registered the active worker (sw.js names it after `?build=`). */
function currentCacheName(page: Page) {
  return page.evaluate(async (prefix) => {
    const { active } = await navigator.serviceWorker.ready;
    if (!active) throw new Error('no active service worker');
    return `${prefix}${new URL(active.scriptURL).searchParams.get('build')}`;
  }, CACHE_PREFIX);
}

/** Every URL the worker has put in its cache. */
async function cachedUrls(page: Page) {
  const cacheName = await currentCacheName(page);
  return page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return (await cache.keys()).map((request) => request.url);
  }, cacheName);
}

function cacheNames(page: Page) {
  return page.evaluate(() => caches.keys());
}

/** The app shell's URL: the scope, which is where the picker lives. */
function shellUrl(page: Page) {
  return new URL('./', page.url()).toString();
}

/** Install precaches the shell and the bundle in one atomic addAll, so either entry proves the whole. */
async function waitForPrecache(page: Page) {
  const shell = shellUrl(page);
  await expect
    .poll(
      async () => {
        const urls = await cachedUrls(page);
        return (
          urls.includes(shell) &&
          urls.some((url) => url.includes('/_next/static/'))
        );
      },
      { timeout: PRECACHE_TIMEOUT },
    )
    .toBe(true);
}

test.describe('the service worker', () => {
  test('registers itself under the path the app is served from', async ({
    page,
    baseURL,
  }) => {
    await page.goto('');
    await waitForController(page);

    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return { scope: ready.scope, scriptURL: ready.active?.scriptURL ?? '' };
    });

    // A scope at the origin root is refused on a subdirectory host.
    expect(registration.scope).toBe(baseURL);
    const scriptURL = new URL(registration.scriptURL);
    expect(`${scriptURL.origin}${scriptURL.pathname}`).toBe(
      new URL('sw.js', baseURL).toString(),
    );
    // The build is what gives each deploy a worker, and a cache, of its own.
    expect(scriptURL.searchParams.get('build')).toMatch(/^[\w-]{8,}$/);
  });

  // skipWaiting + clients.claim: otherwise no worker until the next visit.
  test('takes over the page that registered it, without a reload', async ({
    on,
    page,
  }) => {
    await page.goto('');
    await waitForController(page);
    await expect(on(page).picker.locators.dropzone).toBeVisible();
  });

  // One visit, no reload: what the install handler precached is all a visitor gets before the network goes.
  test('precaches the shell and the hashed bundle on the first visit, and nothing else', async ({
    page,
  }) => {
    await page.goto('');
    await waitForController(page);
    await waitForPrecache(page);

    const urls = await cachedUrls(page);
    const shell = shellUrl(page);
    const shellEntries = [
      shell,
      `${shell}site.webmanifest`,
      `${shell}logo.svg`,
    ];
    expect(urls).toEqual(expect.arrayContaining(shellEntries));
    const unexpected = urls.filter(
      (url) =>
        !shellEntries.includes(url) && !url.startsWith(`${shell}_next/static/`),
    );
    expect(unexpected, 'cached beyond the shell and the static bundle').toEqual(
      [],
    );
    // A coverage build ships source maps beside the chunks; the manifest must leave them out.
    expect(
      urls.filter((url) => url.endsWith('.map')),
      'source maps precached',
    ).toEqual([]);

    // The activate handler drops every cache but the current one.
    expect(await cacheNames(page)).toEqual([await currentCacheName(page)]);
  });

  // A cached shell from before a deploy would load chunks the deploy removed from the server.
  test('opens the page the server has now, not the one it cached', async ({
    on,
    page,
  }) => {
    await page.goto('');
    await waitForController(page);
    await waitForPrecache(page);
    const replaced = await page.evaluate(async () => {
      let count = 0;
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        if (!(await cache.match(location.href))) continue;
        await cache.put(
          location.href,
          new Response('<!doctype html><title>old build</title>', {
            headers: { 'Content-Type': 'text/html' },
          }),
        );
        count += 1;
      }
      return count;
    });
    expect(replaced).toBe(1);

    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(on(page).picker.locators.dropzone).toBeVisible();
  });

  test("a new build's worker deletes the old builds' caches, and only those", async ({
    page,
    baseURL,
  }) => {
    await page.goto('');
    await waitForController(page);
    await waitForPrecache(page);
    const previous = await currentCacheName(page);
    await page.evaluate(async (prefix) => {
      await caches.open(`${prefix}shell-v1`);
      await caches.open('another-site-on-this-origin');
    }, CACHE_PREFIX);

    await page.evaluate(async (scope) => {
      await navigator.serviceWorker.register(
        new URL('sw.js?build=e2e-next', scope).toString(),
        { scope },
      );
    }, baseURL as string);

    await expect.poll(() => cacheNames(page)).not.toContain(previous);
    const remaining = await cacheNames(page);
    expect(remaining).not.toContain(`${CACHE_PREFIX}shell-v1`);
    expect(remaining).toContain('another-site-on-this-origin');
  });

  // Why the worker exists: no cache headers from the host, no connection here, and only one visit before it.
  test('still opens the app with the network gone after a single visit', async ({
    on,
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      "Playwright's WebKit reports an internal error on a navigation served by the service worker while offline",
    );
    await page.goto('');
    await waitForController(page);
    await waitForPrecache(page);

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(on(page).picker.locators.dropzone).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  // The worker chunks are fetched only when a burst is combined, so this is what proves they were precached.
  test('combines a burst with the network gone after a single visit', async ({
    on,
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      "Playwright's WebKit reports an internal error on a navigation served by the service worker while offline",
    );
    test.setTimeout(TINY_PIPELINE_TIMEOUT * 2);
    const problems = collectPageProblems(page);
    await page.goto('');
    await waitForController(page);
    await waitForPrecache(page);

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const app = on(page);
      await expect(app.picker.locators.dropzone).toBeVisible();
      await app.picker.do.addPhotos(listBurst('burst-tiny'));
      await expect(app.picker.locators.thumbnails).toHaveCount(3);
      await app.picker.do.selectQuality('low');
      await app.picker.do.combine();

      await expect(app.progress()).toBeVisible();
      await expect(app.result()).toBeVisible({
        timeout: TINY_PIPELINE_TIMEOUT,
      });
      await expect(app.result.locators.stats).toContainText('3');
    } finally {
      await context.setOffline(false);
    }
    expectNoPageProblems(problems);
  });
});
