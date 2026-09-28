# Developer guide

Recipes for developing and operating ExposureBuddy. Local setup and the
pre-PR checklist are in [CONTRIBUTING.md](../../CONTRIBUTING.md); this guide
covers each check in depth, and everything past the checklist.

## Run the checks CI runs, locally

The checklist in [CONTRIBUTING.md](../../CONTRIBUTING.md#before-opening-a-pull-request)
is CI's `build_and_test` job step for step, plus `mutation_test`. The
tool-dependent jobs — `opengrep`, `lighthouse`, `zap_baseline` — each have a
section below.

On a pull request, CI's `changes` job skips `build_and_test`, `mutation_test`,
`opengrep`, `lighthouse` and `zap_baseline` unless `web/**`, `.zap/rules.tsv`,
`.semgrepignore`, `ci.yml` or a composite action in `.github/actions/`
changed. Any other path — a workflow, the docs — runs only `prek` on a PR, so
run the matching checks locally for it. A push to `main` or a dispatch runs
everything, and the deploy waits for that run. A skipped job reports as
passed. Every job writes its report to its own Actions summary rather than a
PR comment ([Configuration](../reference/configuration.md#ci-job-summaries)).

## Run the end-to-end suite

```bash
cd web
npm run fixtures   # once: the synthetic bursts, into e2e/fixtures/generated
npm run build      # the suite drives the built export, not the dev server
npm run e2e
```

Playwright starts and stops the server itself, serving `out/` **under the base
path** (`/ExposureBuddy`) the way GitHub Pages does — `next build` bakes that
path into every asset URL, so an export served at `/` 404s on nearly
everything. `scripts/serve-export.mjs` builds the directory for that, reading
the path from `next.config.ts`. With `PAGES_BASE_URL` set to a URL without a
path, for both the build and the suite, the export is built for and served at
`/`, as on a [custom domain](#move-to-a-custom-domain).

```bash
npx playwright test --ui                        # pick tests, watch, step through
npx playwright test e2e/public/theme.spec.ts
npx playwright test --project=mobile            # the Pixel 7 viewport only
npx playwright install firefox webkit           # once, for the other engines
npx playwright test --project=webkit-mobile
npx playwright show-report                      # after a failed run
```

Four engines, because the pipeline lives on browser APIs that differ between
them: `chromium`, `mobile` (Pixel 7), `firefox` and `webkit-mobile` (iPhone
14). CI runs all four. Locally, Firefox and WebKit need a one-time
`npx playwright install firefox webkit`, and that download is blocked on some
networks; without them, run the Chromium projects only
(`npm run e2e -- --project=chromium --project=mobile`), since a project whose
browser is missing fails rather than skips, and let CI run the other two
([why](../explanation/design-decisions.md#why-firefox-and-webkit-run-in-ci-only)).

The same suite runs against the deployed site after every release, on
Chromium only:

```bash
E2E_BASE_URL="https://nobuddyorg.github.io/ExposureBuddy/" npm run e2e -- --project=chromium
```

With `E2E_BASE_URL` set it starts no server. That run catches what only
production has: a wrong base path, an icon that 404s, a stale asset. Every
spec is read-only against any origin — nothing leaves the browser — so the
whole suite, the burst journey included, is safe against the live site.

### How a spec addresses the app

Every element a spec touches carries a `data-testid`
([Architecture](../reference/architecture.md#the-screen) lists them), and no
spec names a selector of its own. `e2e/pages/` holds one page object per
screen, `createPageTree(page)` collects them, and `e2e/fixture.ts` hands that
tree to every test as the `on` fixture, so a test starts `async ({ on, page })`
and reads as the journey it is. [TEST_STRATEGY.md](../../TEST_STRATEGY.md) §9
has the shape and the rules; the screens are `header`, `help`, `picker`,
`progress`, `result`, `pipelineError` and `notFound`. A new case that needs
an element with no id adds the id to the component and a locator to the page
object. The grep that keeps this honest should return only `html`, `body`,
`meta` and `link` assertions:

```bash
grep -rn 'getByTestId\|getByRole\|locator(' web/e2e --include=*.spec.ts
```

The journey spec checks correctness, not only that a result appeared: it
renders the fixture's known background through the reference frame's transform
(`e2e/burst.ts`), finds that crop in the result canvas, and asserts the road
band with ghosts off is within a tolerance of the person-free scene, and
further from it with ghosts on. `e2e/helpers.ts` fails any spec on an
uncaught error or a console error.

### The e2e coverage report

`npm run e2e` collects JS/CSS coverage through Playwright's own
`page.coverage` (Chromium CDP, no instrumentation step) when
`E2E_COVERAGE=true`, on the two Chromium projects; `firefox` and
`webkit-mobile` have no CDP and contribute nothing.
`e2e/global-teardown.ts` merges every worker's data into
`web/coverage-e2e/index.html` and applies the floor in `e2e/coverage.ts`. V8
discards a document's counts on a full navigation, whatever
`resetOnNavigation` says, so the fixture flushes them before every
`page.goto` and `page.reload`.

It only maps to `src/app/**` on a build made with
`E2E_COVERAGE_SOURCEMAPS=true`; a build without it (the deploy) has nothing to
map to, so its "lines" would be a few dozen minified ones. CI's
`build_and_test` sets both; the smoke test sets neither.

```bash
E2E_COVERAGE_SOURCEMAPS=true npm run build
E2E_COVERAGE=true npm run e2e -- --project=chromium --project=mobile
```

## Run mutation testing

```bash
cd web
npm run test:mutation
```

Stryker mutates exactly the files in [`mutation-targets.mjs`](../../web/mutation-targets.mjs),
which `vitest.config.mts` also reads for its per-file 100% coverage floors, so
the two cannot drift: the kernels under `vision/` and the orchestration under
`exposure/` (the coordinator, the hook, the worker port and server), never a
component or a worker entry point. A file goes on the list once its logic is
reachable from tests without faking the world: workers and canvases arrive
through injected factories and handlers. There is no `Stryker disable` or
`/* v8 ignore */` in `src/`; a survivor is a missing assertion or dead code to
delete ([why](../explanation/design-decisions.md#why-mutation-testing-is-scoped-to-the-pure-modules)).

Runs are incremental: Stryker keeps every mutant's result in
`web/reports/stryker-incremental.json` and reruns only mutants whose code or
covering tests changed since. It cannot see a change anywhere else — a module
a target imports, a test helper, a dependency — so after one of those, or to
reproduce `main`, rerun everything:

```bash
npm run test:mutation -- --force
```

CI runs this on every PR, restoring `main`'s incremental file; `main` itself
always runs with `--force`. Only `main` publishes to the
[Stryker dashboard](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/ExposureBuddy/main);
locally, the report is `web/reports/mutation/index.html`.

## Replay a property-test failure

The kernels carry fast-check properties beside their example tests: a
homography round-trips a point through its inverse, an integral image's
rectangle sum equals the brute-force sum, a median is a member of its input and
sits between the extremes, a warp of the identity is the input. Every run uses
one fixed seed from `vitest.setup.ts`, so a failure reproduces as it stands. A
failure prints its seed and a shrunk counterexample; to replay a different
seed, or explore new inputs:

```bash
cd web
FC_SEED=12345 npx vitest run src/app/vision
```

## Run Opengrep

CI's `opengrep` job scans `web/src`, `web/scripts` and `web/e2e` with
[Opengrep](https://opengrep.dev/) and uploads SARIF to the Security tab. It is
a standalone binary, not an npm dependency; CI downloads the same release and
checks its hash ([Bump a pinned CI tool](#bump-a-pinned-ci-tool)):

```bash
curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/v1.30.0/install.sh | bash -s -- -v v1.30.0
"$HOME/.opengrep/cli/latest/opengrep" scan --config auto web/src web/scripts web/e2e
```

`--config auto` fetches Semgrep's public community rules anonymously. An
**ERROR** finding fails the job; WARNING and INFO are surfaced for triage. It
runs in CI rather than as a commit hook because of that network fetch.

A file Opengrep cannot parse is only partially analyzed, and no finding in its
unparsed lines is ever reported. CI's job summary names each one with its
first error line; locally, add `--verbose` to the scan to name them. None is
expected: keep the count at zero rather than adding the file to
`.semgrepignore`. Two TypeScript constructs are known to trip the parser, so
write the equivalent instead:

- an `import('module').Name` type: use `import type { Name } from 'module'`;
- an instantiation expression such as `ReturnType<typeof vi.fn<F>>`: use
  `Mock<F>` from `vitest`.

## Run Lighthouse

CI's `lighthouse` job runs [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
against the production export, served under its base path as Pages serves it,
never against `next dev`:

```bash
cd web
npm run lighthouse   # builds the export, then lhci autorun
```

`scripts/lighthouse.mjs` points chrome-launcher at Playwright's Chromium
(`CHROME_PATH` overrides it). Thresholds are in `web/lighthouserc.json`:
performance, best-practices and SEO against a measured baseline with margin,
accessibility at exactly 1.0 as a second, weighted lens on the page
`@axe-core/playwright` already checks in the e2e suite. A finding fixed for
Lighthouse gets an axe or Playwright case too, so it cannot regress between
runs. The page it measures is the picker: the one screen a first visit shows,
with the workers not yet started, so the score is about the shell and not
about the kernels.

## Run the OWASP ZAP baseline scan

CI's `zap_baseline` job runs a passive scan against the built export. It
reports headers and passive-injection findings; with no server, no session and
no form that posts anywhere, that is all a scan can see
([TEST_STRATEGY.md](../../TEST_STRATEGY.md) §5). Locally:

```bash
cd web
npm run build
ln -s . out/ExposureBuddy   # zap-baseline.py always spiders from the host root
npx serve out -l 4173
```

In a second terminal, from the repository root (Docker Desktop: replace
`--network host` with `-t http://host.docker.internal:4173/`):

```bash
docker run --rm -v "$(pwd):/zap/wrk/:rw" --network host \
  ghcr.io/zaproxy/zaproxy:2.17.0 \
  zap-baseline.py -t http://127.0.0.1:4173/ -c /zap/wrk/.zap/rules.tsv -I \
  -r /zap/wrk/zap-report.html
```

Afterwards delete `zap-report.html` and `out/ExposureBuddy`; `npm run e2e`
serves the export differently and does not expect the symlink. The rules an
export on a static host can never satisfy (headers only a server sends) are
ignored in [`.zap/rules.tsv`](../../.zap/rules.tsv), each with its reason;
`Application Error Disclosure` is the one rule promoted to FAIL, since it
fires on rendered HTML.

## Bump a pinned CI tool

Every third-party action is pinned by commit hash with its exact version in a
comment, in the workflows and in `.github/actions/*/action.yml` alike;
Dependabot's `github-actions` ecosystem scans both and moves those pins. It
does not see what a job downloads at run time, so these pins move only by
hand, in a reviewed PR:

| Tool | Pinned in | Pin |
| --- | --- | --- |
| gitleaks | `ci.yml` (`prek`) | `GITLEAKS_VERSION`, `GITLEAKS_SHA256`: the `linux_x64` line of the release's `gitleaks_<version>_checksums.txt`. Keep it equal to the hook's `rev` in `.pre-commit-config.yaml`. |
| Opengrep | `ci.yml` (`opengrep`) | `OPENGREP_VERSION`, `OPENGREP_SHA256`: `sha256sum` of the release's `opengrep_manylinux_x86` asset (the release publishes no checksum file), once `cosign verify-blob --cert <asset>.cert --signature <asset>.sig --certificate-identity-regexp 'https://github.com/opengrep/opengrep/.+' --certificate-oidc-issuer https://token.actions.githubusercontent.com <asset>` accepts it. Also the version in [Run Opengrep](#run-opengrep). |
| prek | `ci.yml` (`prek`) | `prek-version` on `j178/prek-action`. |
| ZAP | `ci.yml` (`zap_baseline`) | `ZAP_IMAGE`: a release tag plus its digest, from `docker buildx imagetools inspect ghcr.io/zaproxy/zaproxy:<tag>`. Also the tag in [Run the OWASP ZAP baseline scan](#run-the-owasp-zap-baseline-scan). |
| Node.js | `.github/actions/setup-web` | `node-version`; also the prerequisite in CONTRIBUTING.md. |
| Playwright browsers | `web/package-lock.json` | Move with `@playwright/test`; `npx playwright install` fetches the matching builds. |

The hook revisions in `.pre-commit-config.yaml` are commit SHAs with a
`# frozen:` tag, which Dependabot's `pre-commit` ecosystem bumps together.

Every job carries a `timeout-minutes` of roughly three times its observed
duration, and every `curl` a `--connect-timeout` and `--max-time`, so a hung
runner or endpoint fails the job instead of holding it for the six-hour
default. When a job grows past its limit legitimately, raise the limit from the
new measured duration.

## Regenerate the app icons

```bash
cd web
npm run icons
```

Renders every icon in `web/public/` from `web/public/logo.svg` with
Playwright's Chromium: the two Android sizes, the maskable one with its
artwork inside the safe circle, the Apple touch icon composited onto the dark
background, and the favicon. Needs a headless browser, so it is not part of
the build; commit what it writes. `src/app/manifest.test.ts` checks that every
icon `site.webmanifest` names exists at the size it claims, and
`e2e/public/pwa.spec.ts` that the deployed base path serves each one.

## Regenerate the e2e fixtures

```bash
cd web
npm run fixtures
```

`scripts/make-fixtures.mjs` writes `e2e/fixtures/generated/` from a seeded
generator, so every run produces byte-identical files: a textured street with
a walker seen through small rotations, translations, scale jitter and gain
jitter, a tiny burst, two unrelated scenes for the error journey, and a text
file that is not an image. Each burst's `meta.json` records every frame's
transform and gain and the reference index, which the journey spec uses to
compute the expected scene. The directory is gitignored: change the generator,
not the files ([why](../explanation/design-decisions.md#why-the-e2e-fixtures-are-generated-never-committed)).
CI runs it before every build that the e2e suite follows.

## Deploy to GitHub Pages

[`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml) runs when CI
has passed on `main`, run by a push or a dispatch (`workflow_run`), and hourly
as a safety net, and deploys exactly that commit: `gate` checks it is still
`main`'s tip and reads the Pages site URL, whose path the build uses as
`basePath`; `build` exports the site with a `.nojekyll` marker; `deploy`
publishes it; `smoke_test` generates the fixtures and runs the Playwright
suite on Chromium against the live URL. Each job depends on the last. Nothing
deploys from a developer machine.

- **`main`'s CI run is the gate, not the PR's.** A PR merged while behind
  `main` ships only if the merged tree passes; a red `main` deploys nothing
  until a fix merges and passes.
- **Only the tip deploys.** A CI run that finishes late, or is re-run, for a
  commit `main` has moved past deploys nothing; the tip deploys once its own CI
  passes. Deploys queue and never cancel each other.
- **A CI run started with `GITHUB_TOKEN`** (a dispatch from another workflow)
  starts no `workflow_run`; the deploy's own hourly run (`41 * * * *`) deploys
  `main`'s tip once CI passed on it and no run has tried it. To run it sooner:
  Actions → *CI* → *Run workflow* from `main`.
- **By hand:** Actions → *Deploy Pages* → *Run workflow* from `main`
  redeploys `main`'s tip, and only if CI passed on it. Nothing redeploys an
  older commit: going back is a new commit on `main`
  ([Roll back a bad deploy](#roll-back-a-bad-deploy)).
- The workflow runs from `main`'s copy of `pages-deploy.yml`, so a change to
  its trigger takes effect only once merged.

One-time setup for a fork:

1. Repo Settings → Pages → source **GitHub Actions**.
2. Settings → Environments → `github-pages`: deployment branches
   **Selected branches** → `main` only.
3. Secrets (optional): `CODECOV_TOKEN` as a repository secret and again as
   a **Dependabot** secret, since a Dependabot PR's run reads no other.
   Without the token the Codecov upload is best effort and never fails the
   job; with it, a refused upload does, so a pull request from another fork
   (which gets no secrets) uploads best effort too.
4. The base path: the deploy takes `basePath` from the Pages site URL, so a
   repository named `ExposureBuddy` needs nothing. A repository under another
   name serves at `/<name>/`, which the deploy handles the same way; only a
   local build assumes `/ExposureBuddy`, so set `PAGES_BASE_URL` to your site
   URL when you want a local export that matches
   ([Configuration](../reference/configuration.md#environment-variables)), or
   [use a custom domain](#move-to-a-custom-domain).
5. Optional: `STRYKER_DASHBOARD_API_KEY` to publish mutation reports.
6. The README's CodeQL badge relies on GitHub's default code-scanning setup
   (Settings → Code security), a per-repo setting that does not carry over.
7. Settings → Branches (or Rules → Rulesets) → `main`: **Require status checks
   to pass** with the CI jobs required (at least `prek` and `build_and_test`),
   and **Require branches to be up to date before merging**. The deploy gate
   already keeps an untested merge off the live site; this keeps it off
   `main`, where a red run blocks every deploy until fixed.
8. Settings → Code security: enable **Secret Protection** and its **Push
   protection** (free on a public repository), on top of gitleaks.
9. In a public repository, GitHub disables a workflow with a `schedule`
   trigger after 60 days without a commit; `pages-deploy.yml` has one, and a
   disabled workflow also ignores CI's `workflow_run`. GitHub emails a warning;
   `gh workflow enable pages-deploy.yml` or Actions → the workflow → *Enable
   workflow* puts it back.

## Roll back a bad deploy

There is no database and no schema, so a rollback is a plain revert: the
previous bundle is the previous commit's export, and nothing outside the
repository remembers the bad one.

```bash
git revert -m 1 <merge commit>   # drop -m 1 for a squash merge
```

Open a PR with it, merge, and the deploy publishes the reverted tree once CI
passes on `main`. Two things to know:

- **The service worker.** A visitor's open tab keeps the bad build until it
  reloads; on the next navigation the shell is fetched network-first, so the
  reverted build replaces it, and the new worker deletes the bad build's cache
  ([why](../explanation/design-decisions.md#why-the-service-worker-fetches-the-shell-network-first)).
- **Nothing redeploys an older commit** by hand: *Run workflow* on Deploy
  Pages deploys `main`'s tip, which after the revert is what you want.

## Move to a custom domain

The code needs no change: `pages-deploy.yml` reads the site URL from the Pages
settings (`actions/configure-pages` in `gate`) and passes it to the build as
`PAGES_BASE_URL`, whose path, empty on a custom domain, becomes `basePath`,
and `site.webmanifest` names its URLs relative to itself. A workflow-deployed
site ignores a `CNAME` file, so there is none. Language and theme are stored
per origin, so visitors start on the defaults, and an installed app is
installed again from the new address.

1. **Rehearse locally.** From `web/`:
   `PAGES_BASE_URL=https://exposurebuddy.example/ npm run build`, then the
   same variable on `npx playwright test --project=chromium`, which serves
   and tests the export at `/`. Run `npm run build` again afterwards.
2. **Verify the domain for the account or org** (Settings → Pages → Add a
   domain, a `TXT` record GitHub names). Unverified, another GitHub account
   could claim the subdomain, now or after Pages is switched off with the DNS
   record left in place.
3. **DNS:** a `CNAME` record for the subdomain → `<owner>.github.io`, no
   wildcard.
4. **Repo Settings → Pages → Custom domain:** the subdomain, save, wait for
   the DNS check and the certificate, then tick **Enforce HTTPS**.
5. **Actions → Deploy Pages → Run workflow** from `main`. `gate` now reads
   the new URL, the build is served at `/`, and `smoke_test` runs against
   the new address. `curl -sI` on the old address should now answer with a
   redirect to the new host.
6. **Links:** the repository's website field and anything else pointing at
   the old address.

To undo: remove the custom domain and deploy again by hand.
