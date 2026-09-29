import { defineConfig } from 'vitest/config';

import { MUTATE_TARGETS } from './mutation-targets.mjs';

// Declared before PER_FILE_FLOOR: ci.yml's vitest-coverage-report-action regex-scans this file for the first `statements: N`.
const GLOBAL_COVERAGE_THRESHOLDS = {
  statements: 95,
  branches: 90,
  functions: 95,
  lines: 95,
};

const PER_FILE_FLOOR = {
  statements: 100,
  functions: 100,
  branches: 100,
  lines: 100,
};

const perFileThresholds = Object.fromEntries(
  MUTATE_TARGETS.map((path) => [path, PER_FILE_FLOOR]),
);

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // scripts/: only a build script whose output ships (the precache manifest) has a test beside it.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // `json-summary` feeds ci.yml's vitest-coverage-report-action.
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/app/**/*.{ts,tsx}'],
      exclude: [
        'src/app/**/types.ts',
        // Fixtures, fakes and wrappers shared by a family of test files; test code, not product code.
        'src/app/**/*.test-support.{ts,tsx}',
        'src/app/i18n/*.json',
        '**/*.d.ts',
        // Routing glue, worker entry points and the browser-only steps they run: verified by Playwright, not unit tests.
        'src/app/layout.tsx',
        'src/app/page.tsx',
        'src/app/workers/*.worker.ts',
        'src/app/exposure/decode.ts',
        'src/app/exposure/workerScope.ts',
        'src/app/exposure/workerFactory.ts',
      ],
      thresholds: {
        ...GLOBAL_COVERAGE_THRESHOLDS,
        // On, it wrote the local measurement back into this file, turning a green local run into a red PR.
        autoUpdate: false,
        // Built from the shared list rather than listed by hand, so it cannot drift from what Stryker mutates.
        ...perFileThresholds,
      },
    },
  },
});
