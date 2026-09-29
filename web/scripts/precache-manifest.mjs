// Writes out/precache.json, the hashed bundle public/sw.js precaches at install; `npm run build` runs it after `next build`.
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC_ROOT = '_next/static/';

/** The manifest for `files` (paths relative to the export root): the bundle without its source maps, sorted so a build is reproducible. */
export function toManifest(files) {
  return files
    .filter((file) => file.startsWith(STATIC_ROOT) && !file.endsWith('.map'))
    .sort();
}

/** Every file under `exportDirectory`, as a `/`-separated path relative to it. */
function listFiles(exportDirectory) {
  return readdirSync(exportDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(exportDirectory, resolve(entry.parentPath, entry.name))
        .split(sep)
        .join('/'),
    );
}

function main() {
  const exportDirectory = resolve(
    fileURLToPath(new URL('../out/', import.meta.url)),
  );
  const manifest = toManifest(listFiles(exportDirectory));
  if (manifest.length === 0) {
    throw new Error(`no ${STATIC_ROOT}** files under ${exportDirectory}`);
  }
  writeFileSync(
    resolve(exportDirectory, 'precache.json'),
    `${JSON.stringify(manifest)}\n`,
  );
  const bytes = manifest.reduce(
    (total, file) => total + statSync(resolve(exportDirectory, file)).size,
    0,
  );
  console.log(
    `precache.json: ${manifest.length} files, ${Math.round(bytes / 1024)} KiB to precache on the first visit`,
  );
}

// Run by `npm run build`; imported, for its test, it only exports.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
