# Contributing to ExposureBuddy

## No outside contributions

ExposureBuddy is a personal hobby project. I don't accept pull requests,
issues or feature requests from outside the project; they are closed without
review.

Want to change something? **Fork it.** The [MIT License](LICENSE) lets you
use, change and redistribute the code in your own fork, no need to ask. There
is no support for forks; the [developer guide](docs/how-to/developer-guide.md)
covers deploying one to its own Pages site.

The rest of this guide is how the project itself is worked on; it applies
equally to a fork.

## Prerequisites

- **Node.js 22** — CI pins 22.x, and the test setup relies on Node 22
  behaviour.

Nothing else: there is no backend, no database and no account. The app is a
static export that computes everything in the browser.

## Run it locally

```bash
cd web && npm install
npm run dev          # http://localhost:3000
```

`npm run dev` serves from `/`; the deployed build lives under `/ExposureBuddy/`
(or a custom domain's root), which the e2e suite and Lighthouse reproduce by
serving the export under that path.

## Commit hooks

[prek](https://github.com/j178/prek) runs [`.pre-commit-config.yaml`](.pre-commit-config.yaml)
on every commit; `pre-commit` reads the same file:

- file hygiene, `typos` ([`_typos.toml`](_typos.toml) excludes the German
  dictionary, the lockfile and the fixtures), `markdownlint`;
- gitleaks over the staged changes with its default rules
  ([`.gitleaks.toml`](.gitleaks.toml)); CI rescans every commit, so a commit
  made without the hook fails there;
- `zizmor` and `actionlint` over `.github/` — security, then syntax,
  expression types, job references, and ShellCheck on workflow `run:` blocks
  when `shellcheck` is on your `PATH` (CI's runner has it; composite actions'
  own scripts are not checked);
- lockfile-lint on `web/package-lock.json`: every package from
  `registry.npmjs.org`, over HTTPS, with an integrity hash;
- the same format/lint/type/architecture/dead-code checks CI runs in `web/`.

```bash
prek install           # once
prek run --all-files   # everything, without committing
```

## Before opening a pull request

From `web/`, in this order — `build` generates `next-env.d.ts`, which `tsc`
and ESLint need:

```bash
npm run build
npx tsc --noEmit
npx prettier --check .
npm run lint
npm run depcruise         # architectural boundaries
npm run knip              # dead code / unused dependencies
npm test -- --coverage
npm run e2e               # needs `npm run fixtures` once; chromium + mobile locally, all engines in CI
```

These are CI's `build_and_test` job. The rest of CI is required when your
change touches what it covers:

| Command | Required when you touched | CI job |
| --- | --- | --- |
| `npm run test:mutation` | code in a file listed in `web/mutation-targets.mjs` (comments produce no new mutants) | `mutation_test` |
| `opengrep scan --config auto web/src web/scripts web/e2e` | anything under those paths | `opengrep` |
| `npm run lighthouse` | anything that ships in the bundle | `lighthouse` |
| OWASP ZAP baseline | the CSP, the frame-busting script, anything rendered into the HTML | `zap_baseline` |

The [developer guide](docs/how-to/developer-guide.md) has each one's install
steps, what it reads, and how to interpret a failure. On a PR, CI skips jobs
whose paths did not change; the local list above is not conditional.

## What a pull request says

- **A kernel change** (anything under `web/src/app/vision/`) names the
  synthetic image it was tested on and the known answer it must produce, and
  the working resolution and frame count behind any speed it claims.
- **A change to what the pipeline does with a frame** — skipping, gain,
  cropping, the composite formula — updates
  [architecture.md](docs/reference/architecture.md) and, if the reason moved,
  [design-decisions.md](docs/explanation/design-decisions.md) in the same PR.
- **A UI change** ships an end-to-end case for its journey; **a functional
  change** ships a unit test. Which layer proves what:
  [TEST_STRATEGY.md](TEST_STRATEGY.md).
- **A user-facing string** exists in both `web/src/app/i18n/de.json` and
  `en.json`; a change to what the app stores in the browser updates the
  privacy text in both.
- **A deliberate trade-off** — the obvious version over an abstraction, a
  suppression with its reason — is named, not left for review to find.

Never lower a coverage or mutation threshold to get to green, and never
commit to `main` — the hook blocks it, and `--no-verify` is not the answer.
