// Copies the MediaPipe Wasm runtime from node_modules into public/ml/ before dev and build; the copies are not committed.
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The classic-script build of the runtime: Turbopack's worker bootstrap is a classic worker, which can only `importScripts` that one. */
export const RUNTIME_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
];

/** Copies `RUNTIME_FILES` from the package's `wasm/` folder to `destination`; returns what it copied. */
export function copyRuntime(packageDirectory, destination) {
  mkdirSync(destination, { recursive: true });
  for (const file of RUNTIME_FILES)
    copyFileSync(
      resolve(packageDirectory, 'wasm', file),
      resolve(destination, file),
    );
  return RUNTIME_FILES;
}

// Run by npm's `predev` and `prebuild`; imported, for its test, it only exports.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const web = resolve(fileURLToPath(import.meta.url), '../..');
  const copied = copyRuntime(
    resolve(web, 'node_modules/@mediapipe/tasks-vision'),
    resolve(web, 'public/ml'),
  );
  console.log(`public/ml: copied ${copied.join(', ')}`);
}
