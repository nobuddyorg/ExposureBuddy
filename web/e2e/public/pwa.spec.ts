import { expect, test } from '../fixture';

type ManifestIcon = { src: string; sizes: string; purpose?: string };
type Manifest = {
  name: string;
  display: string;
  scope: string;
  start_url: string;
  icons: ManifestIcon[];
};

async function manifestOf(page: import('@playwright/test').Page) {
  await page.goto('');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href, 'manifest link').toBeTruthy();
  const manifest = await page.evaluate(async (url) => {
    const response = await fetch(url as string);
    return {
      status: response.status,
      body: (await response.json()) as Manifest,
    };
  }, href);
  // A manifest's URLs resolve against the manifest, not the page that links it.
  const manifestUrl = new URL(href as string, page.url());
  return { ...manifest, manifestUrl };
}

// What the manifest links must resolve at the deployed base path, not only on disk.
test.describe('the installable app', () => {
  test('links a manifest that the browser can fetch', async ({ page }) => {
    const manifest = await manifestOf(page);
    expect(manifest.status).toBe(200);
    expect(manifest.body.name).toBe('ExposureBuddy');
    expect(manifest.body.display).toBe('standalone');
  });

  test('serves every icon it advertises, at the size it claims', async ({
    page,
    request,
  }) => {
    const { body, manifestUrl } = await manifestOf(page);
    expect(body.icons.length).toBeGreaterThan(0);

    for (const icon of body.icons) {
      const url = new URL(icon.src, manifestUrl).toString();
      const response = await request.get(url);
      expect(response.status(), `${icon.src} (${icon.sizes})`).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');

      // Real dimensions from the PNG header, to catch a manifest entry that drifted from its file.
      const bytes = Buffer.from(await response.body());
      const [width, height] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
      expect(`${width}x${height}`, `${icon.src} real size`).toBe(icon.sizes);
    }
  });

  test('offers an icon big enough for a splash screen', async ({ page }) => {
    const { body } = await manifestOf(page);
    const large = body.icons.filter(
      (icon) =>
        icon.purpose !== 'maskable' && Number(icon.sizes.split('x')[0]) >= 512,
    );
    expect(large.length).toBeGreaterThan(0);
  });

  test('serves the apple touch icon it links', async ({ page, request }) => {
    await page.goto('');
    const href = await page
      .locator('link[rel="apple-touch-icon"]')
      .getAttribute('href');
    expect(href, 'apple-touch-icon link').toBeTruthy();
    const response = await request.get(
      new URL(href as string, page.url()).toString(),
    );
    expect(response.status()).toBe(200);
  });

  // Relative in the file, so what matters is where they resolve at the deployed base path.
  test('scopes the manifest to where the app is actually served', async ({
    page,
  }) => {
    const { body, manifestUrl } = await manifestOf(page);
    // The page is the app root itself.
    const appRoot = new URL('./', page.url()).pathname;
    expect(new URL(body.scope, manifestUrl).pathname).toBe(appRoot);
    expect(new URL(body.start_url, manifestUrl).pathname).toBe(appRoot);
  });
});
