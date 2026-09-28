// Renders public/'s icons from public/logo.svg with Playwright's Chromium; run by hand (`npm run icons`), results committed.
import { readFileSync, writeFileSync } from 'node:fs';

import { chromium } from 'playwright';

const publicDirectory = new URL('../public/', import.meta.url);
const logo = readFileSync(new URL('logo.svg', publicDirectory), 'utf8');
const logoUri = `data:image/svg+xml;base64,${Buffer.from(logo).toString('base64')}`;

// The dark page background (`--background` of the dark theme, the manifest's background_color).
const DARKROOM = '#0f0e0c';

// A maskable icon may be cropped to the inner 80% circle, so the artwork must sit inside it.
const SAFE_CIRCLE = 0.8;

const targets = [
  // The two sizes Android looks for: home screen, then splash screen and install prompt.
  { file: 'icon-192.png', size: 192, artwork: 1, background: 'transparent' },
  { file: 'icon-512.png', size: 512, artwork: 1, background: 'transparent' },
  {
    file: 'icon-maskable-512.png',
    size: 512,
    artwork: SAFE_CIRCLE,
    background: DARKROOM,
  },
  // iOS asks for exactly 180, composites onto black, and rounds the corners itself, so opaque and full-bleed.
  {
    file: 'apple-touch-icon.png',
    size: 180,
    artwork: 1,
    background: DARKROOM,
  },
  {
    file: 'favicon-32x32.png',
    size: 32,
    artwork: 1,
    background: 'transparent',
  },
];

// Unset, Playwright finds its own download; set, it runs a Chromium installed elsewhere (a container without the download).
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
});
const page = await browser.newPage({ deviceScaleFactor: 1 });

// Returns the PNG bytes: favicon.ico's 16px layer needs a render that never becomes its own file.
async function renderSquare({ size, artwork, background }) {
  const artworkSize = Math.round(size * artwork);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;background:${background};display:flex;align-items:center;justify-content:center">
       <img src="${logoUri}" style="width:${artworkSize}px;height:${artworkSize}px;display:block">
     </body>`,
  );
  await page.locator('img').waitFor({ state: 'visible' });
  return page.screenshot({
    clip: { x: 0, y: 0, width: size, height: size },
    omitBackground: background === 'transparent',
  });
}

for (const target of targets) {
  const png = await renderSquare(target);
  writeFileSync(new URL(target.file, publicDirectory), png);
  console.log(
    `${target.file}: ${target.size}x${target.size}, artwork ${Math.round(target.size * target.artwork)}px on ${target.background}`,
  );
}

// An ICONDIR header, one ICONDIRENTRY per image, then the raw PNG bytes.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // color count: not palette-based
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

// Transparent: a browser tab supplies its own background.
const favicon16 = await renderSquare({
  size: 16,
  artwork: 1,
  background: 'transparent',
});
const favicon32 = readFileSync(new URL('favicon-32x32.png', publicDirectory));
const ico = buildIco([
  { size: 16, png: favicon16 },
  { size: 32, png: favicon32 },
]);
writeFileSync(new URL('favicon.ico', publicDirectory), ico);
console.log(`favicon.ico: 16px + 32px, ${ico.length} bytes`);

await browser.close();
