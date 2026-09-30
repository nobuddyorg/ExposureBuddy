# Configuration reference

There is no `.env` file: the app reads nothing at runtime. Every variable
below is read by a build, a test run or a CI job.

## Environment variables

| Variable | Read by | Effect |
| --- | --- | --- |
| `PAGES_BASE_URL` | `web/next.config.ts` (build) | Unset: the export is built for `/ExposureBuddy`, the Pages project URL. `pages-deploy.yml` sets it to the Pages site URL from `actions/configure-pages`, whose path becomes `basePath`; empty on a custom domain. `next dev` always serves from `/`. |
| `E2E_BASE_URL` | `web/playwright.config.ts` | Unset: the suite serves `web/out` under the base path and tests it. Set: tests that origin instead, starts no server, `retries: 2`. |
| `E2E_PORT` | `web/playwright.config.ts` | Port of the local export server, default `4173`. |
| `E2E_ALL_ENGINES` | `web/playwright.config.ts` | Set (as `CI` always is): the `firefox` and `webkit-mobile` projects join the run. Unset: the Chromium projects only, so a checkout without those browsers still runs the suite. |
| `CHROMIUM_EXECUTABLE_PATH` | `web/playwright.config.ts`, `web/scripts/lighthouse.mjs`, `web/scripts/make-icons.mjs` | A Chromium binary to launch instead of the one Playwright downloaded, for a machine where that download is blocked. |
| `E2E_COVERAGE` | `web/e2e/coverage.ts` | `true` collects JS/CSS coverage on the Chromium projects and applies the floor in the global teardown. Only worth it on a build made with `E2E_COVERAGE_SOURCEMAPS`. |
| `E2E_COVERAGE_SOURCEMAPS` | `web/next.config.ts` (build) | `true` makes `next build` emit browser source maps so the coverage report maps to `src/app/**`. The deploy build never sets it. |
| `FC_SEED` | `web/vitest.setup.ts` | Replaces fast-check's fixed seed for one run ([Replay a property-test failure](../how-to/developer-guide.md#replay-a-property-test-failure)). |
| `CHROME_PATH` | `web/scripts/lighthouse.mjs` | The browser Lighthouse launches; defaults to Playwright's Chromium so no second browser is downloaded. |
| `STRYKER_DASHBOARD_API_KEY` | `web/stryker.config.mjs` | Present: Stryker adds its `dashboard` reporter. CI passes it on `main` only. |
| `CODECOV_TOKEN` | `ci.yml` (`build_and_test`) | Codecov's upload token; when it is set a refused upload fails the job (`fail_ci_if_error`), when it is missing the upload is best effort. |

Two values `next.config.ts` derives and bakes into the bundle, not inputs:
`NEXT_PUBLIC_BASE_PATH` (the base path, for the service-worker registration
and asset URLs) and `NEXT_PUBLIC_BUILD_ID` (a UUID per build that versions
the service worker's cache).

## GitHub Actions secrets

| Secret | Used by | Notes |
| --- | --- | --- |
| `CODECOV_TOKEN` | `ci.yml` (`build_and_test`) | Optional: the repository's upload token from codecov.io. Without it the upload is best effort and never fails the job; with it, set it as a **Dependabot** secret too, or every Dependabot PR fails `build_and_test`. |
| `STRYKER_DASHBOARD_API_KEY` | `ci.yml` (`mutation_test`, on `main` only) | Optional; without it Stryker writes a local HTML report only. |

Nothing else: the deploy needs only the `github-pages` environment's OIDC
token, which `deploy-pages` mints itself. gitleaks
([`.gitleaks.toml`](../../.gitleaks.toml), default rules) runs on the staged
changes as a commit hook and over every commit `HEAD` reaches in CI's `prek`
job; a secret it finds after a push is already public, so rotate it, then drop
the commit from the branch.

## Ports

| Port | Used by |
| --- | --- |
| `3000` | `npm run dev` |
| `4173` | The export server for the e2e suite (`E2E_PORT`), Lighthouse (`web/lighthouserc.json`) and the ZAP baseline |

## Coverage, mutation and performance thresholds

Every value is a **floor set from measurement**, raised by hand when a real run
reports a higher number and never lowered to make a change fit
([CLAUDE.md](../../CLAUDE.md), hard rules).

| Gate | Where | Value |
| --- | --- | --- |
| Unit coverage, global | `web/vitest.config.mts` `GLOBAL_COVERAGE_THRESHOLDS` | 95% statements, 90% branches, 95% functions, 95% lines |
| Unit coverage, per file | same file, `PER_FILE_FLOOR`, over every file in `web/mutation-targets.mjs` | 100% on all four |
| Unit coverage, what counts | same file, `coverage.exclude` | Product code only: `*.test-support.*` fakes and fixtures, `types.ts` and the dictionaries are excluded, as are the routing glue (`layout.tsx`, `page.tsx`), the worker entry point and the browser-only steps it runs (`decode.ts`, `workerScope.ts`, `workerFactory.ts`), which Playwright verifies instead |
| Mutation score | `web/stryker.config.mjs` `thresholds` | `break: 99`, `low: 99`, `high: 100`: one below a measured 100, so a single new equivalent mutant cannot block unrelated work |
| E2E JS/CSS coverage | `web/e2e/coverage.ts` `COVERAGE_THRESHOLDS` | Floors a few points under a measured `E2E_COVERAGE=true` run on chromium + mobile: statements 73%, branches 64%, functions 84%, lines 87% |
| Lighthouse | `web/lighthouserc.json` `assert` | Performance at 0.85 (measured 0.93–0.94), best-practices and SEO at 0.9; accessibility at exactly 1.0; LCP ≤ 4000 ms (measured ~2.9 s under Lighthouse's mobile throttling), TBT ≤ 300 ms (measured ~150), CLS ≤ 0.1; median of 3 runs |

`autoUpdate` is off in Vitest: it would write the local measurement back into
the config after every run, so a green local run produced a red PR. Stryker
runs incrementally against `web/reports/stryker-incremental.json`; CI caches
that file keyed on `package-lock.json` and the Stryker and Vitest config, and
`main` passes `--force` for a full run. Stryker runs Vitest through
`web/vitest.mutation.config.mts`, a copy of the config without the
`github-actions` reporter: a killed mutant is an expected test failure, not a
workflow annotation.

## Pipeline limits

The numbers the pipeline is sized by, each in the module that owns it.

| Limit | Where | Value |
| --- | --- | --- |
| Photos per burst | the picker | 100; extra files are dropped with a notice (`picker.too_many`) |
| Minimum photos | `web/src/app/exposure/runPipeline.ts` | 2; the picker's Combine button says how many it still needs |
| Memory budget | `web/src/app/vision/pipeline/budget.ts` `DEFAULT_BUDGET_BYTES` | 256 MiB for the peak, `max(frameCount × 3 + 5, 34) × width × height` bytes at the working size (`peakBytesPerPixel`) |
| Output long edge | same file, `qualityLongEdge` | Small 1024, Standard 1600, Large 2400 px; never upscaled |
| Smallest working long edge | same file, `MIN_LONG_EDGE` | 640 px: the budget never pushes below it; a burst that still does not fit is refused, not crashed |
| Alignment long edge | same file, `ALIGNMENT_LONG_EDGE` | 960 px: the grayscale copy features are detected on |
| Align workers | same file, `workerPoolSize` | `hardwareConcurrency − 1`, clamped to 1…4; 2 when unknown; the stack worker is always one more |
| RANSAC inlier threshold | `web/src/app/vision/geometry/ransac.ts` `DEFAULT_RANSAC_OPTIONS` | 3 px in alignment coordinates ([Architecture](architecture.md#the-pipeline)) |
| Frame accepted as aligned | `web/src/app/vision/pipeline/alignment.ts` `MIN_INLIERS`, `MIN_INLIER_RATIO` | At least 20 inliers and at least 25% of the matches; otherwise the frame is skipped and reported |

## Browser support

The pipeline needs **Web Workers**, **OffscreenCanvas** and
**`createImageBitmap` inside a worker** (with `imageOrientation: 'from-image'`
for EXIF rotation): current Chrome and Edge, Firefox, and Safari 17 or later on
iOS and macOS. `isPipelineSupported()` in `web/src/app/exposure/support.ts`
checks the three at load time; without them the picker shows
`picker.unsupported` instead of the file input. The e2e suite runs on all four
engines in CI (`chromium`, `mobile`, `firefox`, `webkit-mobile` in
`web/playwright.config.ts`) because canvas, worker and file-input behaviour
differ between them.

## CI job summaries

Each job writes its report to its own Actions summary (`$GITHUB_STEP_SUMMARY`);
nothing posts a PR comment, and Codecov's comment is off in
[`codecov.yml`](../../codecov.yml).

| Job | Summary | Source |
| --- | --- | --- |
| `build_and_test` | Coverage against the thresholds above | `davelosert/vitest-coverage-report-action` over the `json-summary` reporter |
| `build_and_test` | e2e results, and the e2e coverage summary | `daun/playwright-report-summary` over the `json` reporter; `web/coverage-e2e/coverage-summary.md` |
| `build_and_test` | `depcruise` and `knip` output | The step's text, `tee`'d into the summary; Knip prints nothing when clean, so the summary says so |
| `build_and_test` | Non-blocking accessibility findings | `web/e2e/axe.ts`, from inside the test, CI only |
| `mutation_test` | Mutation score, overall and per file | `web/scripts/mutation-summary.mjs` over Stryker's `json` reporter |
| `opengrep` | Finding count, total and by rule; every partially analyzed file | `jq` over the uploaded SARIF; `jq` over the same scan's `--json-output` `errors[]` |
| `lighthouse` | Scores, LCP, CLS against the thresholds | `web/scripts/lighthouse-summary.mjs` over `manifest.json` |
| `zap_baseline` | Every alert with its verdict; an alert `.zap/rules.tsv` ignores shows its reason | `web/scripts/zap-summary.mjs` over `report_json.json` from `zaproxy/action-baseline` |

## End-to-end tests

[`web/playwright.config.ts`](../../web/playwright.config.ts), specs in
`web/e2e/`: `public/` (shell, PWA, service worker, theme, i18n, help,
accessibility) and `journey/` (a whole burst through the pipeline, and the
error screen). Projects: `chromium` (Desktop Chrome), `mobile` (Pixel 7),
`firefox` (Desktop Firefox), `webkit-mobile` (iPhone 14). The last two join a
run only when `CI` or `E2E_ALL_ENGINES` is set, and locally they need
`npx playwright install firefox webkit` first; a plain local run is the
Chromium projects. Retries are `0` locally: a page that fails one run in ten
fails for a tenth of visitors.

Fixtures come from `npm run fixtures` (`web/scripts/make-fixtures.mjs`), which
writes synthetic bursts into `web/e2e/fixtures/generated/` (gitignored): a
textured street seen through small camera shakes with a walker, a tiny
three-frame burst, two unrelated scenes, and a file that is not an image. Each
burst carries a `meta.json` with the transform and gain of every frame, which
the journey spec uses to check the result against the known scene.

## i18n

English (`en`, default) and German (`de`):
[`web/src/app/i18n/en.json`](../../web/src/app/i18n/en.json), `de.json`, keys
grouped by area (`app`, `brand`, `header`, `picker`, `progress`, `result`,
`errors`, `help`, `footer`, `not_found`, `page`). The language is a stored
choice (`lang` in `localStorage`), else the browser's, else English;
`pickLanguage()` in `I18nProvider.tsx` and `LANG_INIT_SCRIPT` in `layout.tsx`
decide alike, so `<html lang>` is right before first paint. A `{name}`
placeholder is filled through `t(key, { name })`. `parity.test.ts` fails on a
key missing from either file or on the two files declaring different key sets.

## What the browser stores

`localStorage`: `theme` (`light`, `dark`, or absent for system) and `lang`.
Cache Storage: one `exposurebuddy-<build>` cache per build, holding the app
shell and its hashed assets. Nothing else: no photo, no result, no
identifier. The footer and the help dialog say so; a change here updates
`help.privacy_body` and `footer.privacy` in both dictionaries.
