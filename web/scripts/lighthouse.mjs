// Lighthouse CI against the production export, served as GitHub Pages serves it (scripts/serve-export.mjs), never `next dev`.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const run = (command, args) =>
  execFileSync(command, args, {
    cwd: webDirectory,
    env: {
      ...process.env,
      // chrome-launcher reads CHROME_PATH; the e2e suite's Chromium (or its override) spares a second browser download.
      CHROME_PATH:
        process.env.CHROME_PATH ??
        process.env.CHROMIUM_EXECUTABLE_PATH ??
        chromium.executablePath(),
    },
    stdio: 'inherit',
  });

console.log('Building the export...');
run('npm', ['run', 'build']);

console.log('Running Lighthouse CI against the export...');
run('npx', ['lhci', 'autorun', '--config=lighthouserc.json']);
