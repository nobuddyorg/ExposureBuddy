// Stryker's JSON report as a markdown table, scored by mutation-testing-metrics as Stryker's own reporters are; exits 1 below the break threshold.
import { readFile, appendFile } from 'node:fs/promises';

import { calculateMutationTestMetrics } from 'mutation-testing-metrics';

import { BREAK_THRESHOLD } from '../stryker.config.mjs';

const REPORT_PATH = 'reports/mutation/mutation.json';

function formatScore(score) {
  return Number.isFinite(score) ? `${score.toFixed(2)}%` : 'n/a';
}

function statusIcon(score) {
  if (!Number.isFinite(score)) return '➖'; // no mutants to score
  return score >= BREAK_THRESHOLD ? '✅' : '❌';
}

function toRow(label, metrics) {
  return `| ${statusIcon(metrics.mutationScore)} | ${label} | ${formatScore(metrics.mutationScore)} | ${metrics.killed} | ${metrics.survived} | ${metrics.timeout} | ${metrics.noCoverage} | ${metrics.ignored} |`;
}

function collectFileRows(node, rows) {
  if (node.file) {
    rows.push({ path: node.file.name, metrics: node.metrics });
    return;
  }
  for (const child of node.childResults) collectFileRows(child, rows);
}

async function buildSummary() {
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
  const { systemUnderTestMetrics: root } = calculateMutationTestMetrics(report);

  const fileRows = [];
  collectFileRows(root, fileRows);
  // Worst score first.
  fileRows.sort((a, b) => {
    const scoreA = Number.isFinite(a.metrics.mutationScore)
      ? a.metrics.mutationScore
      : -1;
    const scoreB = Number.isFinite(b.metrics.mutationScore)
      ? b.metrics.mutationScore
      : -1;
    return scoreA - scoreB;
  });

  const lines = [
    `## \u{1f9ec} Mutation testing — ${formatScore(root.metrics.mutationScore)} (break threshold: ${BREAK_THRESHOLD}%)`,
    '',
    '| | File | Score | Killed | Survived | Timeout | No coverage | Ignored |',
    '|---|---|---|---|---|---|---|---|',
    toRow('**All files**', root.metrics),
    ...fileRows.map(({ path, metrics }) => toRow(`\`${path}\``, metrics)),
    '',
    "Full interactive report: download a shard's `mutation-report-<shard>` workflow artifact.",
    '',
  ];
  // No mutants at all scores NaN, which breaks nothing.
  const passed = !(root.metrics.mutationScore < BREAK_THRESHOLD);
  return { summary: lines.join('\n'), passed };
}

async function main() {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  let summary;
  let passed = false;
  try {
    ({ summary, passed } = await buildSummary());
  } catch (error) {
    console.error('Could not read %s:', REPORT_PATH, error);
    summary = [
      '## \u{1f9ec} Mutation testing',
      '',
      `No mutation report found at \`web/${REPORT_PATH}\` -- Stryker likely failed before writing it. Check the "Run mutation testing" step above.`,
      '',
    ].join('\n');
  }

  if (summaryPath) {
    await appendFile(summaryPath, summary);
  } else {
    console.log(summary);
  }
  if (!passed) {
    console.error(
      'Mutation score below the break threshold of %d%%, or no report.',
      BREAK_THRESHOLD,
    );
    process.exitCode = 1;
  }
}

await main();
