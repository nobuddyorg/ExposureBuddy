import { MUTATE_TARGETS } from './mutation-targets.mjs';

// Over the whole target list; below 100 so a single new equivalent mutant cannot block unrelated work.
export const BREAK_THRESHOLD = 99;

// MUTATION_SHARD="i/n" mutates every n-th target from the i-th on, so CI's matrix jobs split the list between them.
function shardOf(targets, shard) {
  if (!shard) return targets;
  const [index, count] = shard.split('/').map(Number);
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    index < 1 ||
    index > count
  ) {
    throw new Error(
      `MUTATION_SHARD must be "i/n" with 1 <= i <= n, got "${shard}"`,
    );
  }
  return targets.filter((_, position) => position % count === index - 1);
}

// `json` feeds scripts/mutation-merge.mjs and scripts/mutation-summary.mjs; CI publishes the merged report to the dashboard.
const reporters = ['html', 'clear-text', 'progress', 'json'];

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  reporters,
  // A vitest config without the `github-actions` reporter: a killed mutant is not a real test failure.
  vitest: {
    configFile: 'vitest.mutation.config.mts',
  },
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  // The sandbox copy cannot copy a symlink; the e2e server's out/ symlink dies on ENOTSUP.
  ignorePatterns: [
    '.e2e-serve',
    'out',
    '.next',
    'coverage',
    'coverage-e2e',
    'reports',
    'test-results',
    'playwright-report',
    'lighthouse-reports',
    'e2e/fixtures/generated',
  ],
  // A mutant covered by hundreds of tests runs the whole suite; the 5s default reported honest failures as timeouts.
  timeoutMS: 20_000,
  // The instrumented suite takes about five minutes on a CI runner; the five-minute default aborted the run before a single mutant.
  dryRunTimeoutMinutes: 15,
  // Shared with vitest.config.mts's per-file coverage floors so the two lists cannot drift.
  mutate: shardOf(MUTATE_TARGETS, process.env.MUTATION_SHARD),
  // Blind to non-mutated, non-test files and dependencies, so the weekly run forces a full one.
  incremental: true,
  // A shard's share is too small to judge alone, so it never breaks; mutation-summary.mjs breaks on the merged score.
  thresholds: {
    high: 100,
    low: 99,
    break: process.env.MUTATION_SHARD ? null : BREAK_THRESHOLD,
  },
};

export default config;
