import type { KnipConfig } from 'knip';

// Only what Knip's static analysis cannot follow: a string inside another tool's config, or a subprocess binary.
const config: KnipConfig = {
  entry: [
    // playwright.config.ts's `webServer.command` is a shell string.
    'scripts/serve-export.mjs',
    // Named only as a string in stryker.config.mjs's `configFile`.
    'vitest.mutation.config.mts',
    // Started with `new Worker(new URL(..., import.meta.url))`, which Knip does not resolve as an entry.
    'src/app/**/*.worker.ts',
  ],
  ignoreDependencies: [
    // Invoked as `npx lhci autorun`; the bin is named `lhci`, so Knip cannot match it back to the package.
    '@lhci/cli',
  ],
};

export default config;
