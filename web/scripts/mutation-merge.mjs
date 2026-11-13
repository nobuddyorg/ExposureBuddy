// Merges the CI matrix shards' Stryker JSON reports (one per subdirectory of the argument) into reports/mutation/mutation.json.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MERGED_PATH = 'reports/mutation/mutation.json';

async function readShardReports(shardsDirectory) {
  const entries = await readdir(shardsDirectory, { withFileTypes: true });
  const reportPaths = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(shardsDirectory, entry.name, 'mutation.json'))
    .sort();
  return Promise.all(
    reportPaths.map(async (reportPath) =>
      JSON.parse(await readFile(reportPath, 'utf8')),
    ),
  );
}

// Every shard runs the whole suite, so the same test file appears in each report; its tests are joined by id.
function mergeTestFiles(reports) {
  const merged = {};
  for (const { testFiles = {} } of reports) {
    for (const [name, testFile] of Object.entries(testFiles)) {
      const tests = new Map(
        (merged[name]?.tests ?? []).map((test) => [test.id, test]),
      );
      for (const test of testFile.tests) tests.set(test.id, test);
      merged[name] = { ...testFile, tests: [...tests.values()] };
    }
  }
  return merged;
}

function mergeReports(reports) {
  if (reports.length === 0) throw new Error('No shard reports to merge');
  return {
    ...reports[0],
    files: Object.assign({}, ...reports.map((report) => report.files)),
    testFiles: mergeTestFiles(reports),
  };
}

const [shardsDirectory] = process.argv.slice(2);
if (!shardsDirectory) {
  throw new Error('Usage: node scripts/mutation-merge.mjs <shards-directory>');
}
const reports = await readShardReports(shardsDirectory);
await mkdir(path.dirname(MERGED_PATH), { recursive: true });
await writeFile(MERGED_PATH, JSON.stringify(mergeReports(reports)));
console.log('Merged %d shard reports into %s', reports.length, MERGED_PATH);
