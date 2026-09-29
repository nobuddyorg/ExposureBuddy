# CLAUDE.md

Standing instructions for Claude Code and any other AI assistant working in
this repository. `web/CLAUDE.md` adds Next.js-specific context on top of this
file. Read this file, [docs/reference/architecture.md](docs/reference/architecture.md)
and [TEST_STRATEGY.md](TEST_STRATEGY.md) before writing anything.

## What this project is

**ExposureBuddy** turns a burst of phone photos of one scene into a single
long-exposure image: every photo is aligned on the static scene with feature
matching, then stacked, so the scene comes out sharp and whatever moved fades
into a translucent ghost. Bilingual (German/English), installable as a PWA,
phone-first.

- **Frontend only**: Next.js App Router as a **static export** on GitHub
  Pages. No server, no backend, no account, no upload. `web/`.
- **All compute in the browser**, in Web Workers, in plain TypeScript over
  typed arrays: `web/src/app/vision/`. No WASM, no OpenCV, no GPU code yet.
- **Privacy is the product claim**: photos never leave the device. Nothing in
  the app may send image data anywhere; the only network traffic is the app
  shell itself.

## Read before you touch

| Area | Read first |
| --- | --- |
| Pipeline stages, module map, layer rules, test ids | [architecture.md](docs/reference/architecture.md) |
| Why a stage works the way it does | [design-decisions.md](docs/explanation/design-decisions.md) |
| Tests: which layer, what may be faked | [TEST_STRATEGY.md](TEST_STRATEGY.md) |
| Local setup, the pre-PR checklist | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Checks, thresholds, deploy | [developer-guide.md](docs/how-to/developer-guide.md) |

## Hard rules

Settled decisions and safety rules. If a task seems to need one reversed, stop
and say so; never work around it quietly.

- No backend, no telemetry, no third-party script, no request carrying
  pixels. A feature that needs a server is a design question for the owner.
- `web/src/app/vision/` stays pure: no React, no Next, no DOM, no `Worker`
  construction. It must run in Node under Vitest. Workers are glue only.
- Never lower a coverage or mutation threshold (`web/vitest.config.mts`,
  `web/stryker.config.mjs`, `web/e2e/coverage.ts`, `web/lighthouserc.json`)
  or auto-ratchet one. An unreachable threshold is a design problem.
- No `/* v8 ignore */` or `// Stryker disable` in `src/`. No `.skip`, ESLint
  or TS suppression without understanding the failure first; the reason goes
  on the same line. No test gaming.
- Never commit to `main`, skip hooks (`--no-verify`), force-push over others'
  commits, or rewrite history on a branch you don't own.
- Never modify `.github/workflows/**`, repository secrets, branch protection,
  or `.pre-commit-config.yaml`'s security hooks unless the user explicitly asks.
- Never run `npm audit fix --force` or a from-scratch `rm -rf node_modules
  package-lock.json && npm install` in `web/`; use targeted `overrides`.
- A package `next build` loads (a PostCSS or Next plugin, TypeScript) goes in
  `dependencies`, never `devDependencies`.

## How to work here

- **Smallest necessary change.** Preserve existing behavior unless changing it
  is what was asked. Boy-scout fixes stay inside the function or file you are
  already editing.
- **When principles collide:** correctness, then KISS/YAGNI, then clean code,
  then DRY, then SOLID. No abstraction for a requirement nobody has; extract
  on the third occurrence. SOLID means modules, hooks and functions -- never
  classes or a DI container. Kernels over typed arrays may be dense; they may
  not be clever without a comment naming the invariant.
- **Split by responsibility:** compute in `vision/` (pure, parameters in,
  values out, never `window`, `Date.now()` or `Math.random()` unless
  injected), orchestrate in `exposure/` (workers, decoding, the hook), render
  in `components/`. Hard-to-reach coverage or a stubborn mutant means extract
  the logic, not force the test. New pure logic goes on
  `web/mutation-targets.mjs`; rendering stays off it.
- **Measure, don't assume.** A kernel's cost is a number a benchmark prints;
  memory is a number the budget computes. State the working resolution and
  the frame count whenever you claim a speed.
- **Clean code, as applied here:** intent-revealing names, no abbreviations or
  type prefixes; small functions with guard clauses; zero to two parameters,
  else a named object, never a boolean flag; command-query separation; no
  `null`/`undefined` as a signal where a type or empty collection models it;
  files under ~350 lines (test files under ~600); no dead code; no dependency
  without clear value over what's here, and none that is deprecated or
  unmaintained.
- **Comments:** one line, hard cap, only for a non-obvious constraint,
  workaround, invariant, or external behavior -- never to narrate code or
  record a decision (that goes in the commit, the PR or design-decisions.md).
- **Fail fast; surface errors.** A frame that cannot be aligned is skipped
  and reported, never silently blended in. A pipeline error reaches the
  screen with its cause.
- **i18n:** every user-facing string goes through `t('...')` and exists in
  **both** `web/src/app/i18n/de.json` and `en.json` in the same change.
- **Accessibility:** every control has an accessible name, every image an
  `alt`, every state a keyboard path; `data-testid` on what the e2e suite
  touches (architecture.md lists them).
- **Tests:** a UI change gets an E2E case for its journey; a functional
  change gets a unit test asserting behavior, not implementation; a kernel
  gets a test on a synthetic image with a known answer, and a property test
  where a property is easy to state (a homography round-trips, a warp of the
  identity is the input). E2E specs reach the app only through the page
  objects in `web/e2e/pages/`, every element by `data-testid` or role.
- **Docs sync:** a change to setup, the checklist, architecture, a design
  decision, or a testing assumption updates the matching `docs/` file (and
  `CONTRIBUTING.md`/`README.md`) in the same change. A change to what the app
  stores in the browser updates the privacy text in both dictionaries.

## Development commands

```bash
cd web && npm install
npm run dev          # http://localhost:3000
npm run fixtures     # synthetic bursts for the e2e suite (web/e2e/fixtures/generated)
```

## Definition of done

Not done -- no "done", no ready PR, no reported success -- until every one of
these is green, from `web/`, in this order (`build` generates `next-env.d.ts`,
which `tsc` and ESLint need):

```bash
npm run build
npx tsc --noEmit
npx prettier --check .
npm run lint
npm run depcruise         # architectural boundaries
npm run knip              # dead code / unused dependencies
npm test -- --coverage
npm run e2e               # needs `npm run fixtures` once; chromium + mobile locally, all engines in CI
npm run test:mutation     # if you changed code in a file listed in web/mutation-targets.mjs
npm run lighthouse        # if anything that ships in the bundle changed
```

`prek run --all-files` from the repo root runs the repo-wide hooks (`typos`,
`zizmor`, `actionlint`, `markdownlint`, file hygiene) plus the same web
checks. A partial run is a status update, not a stopping point. If a gate
blocks finishing, say so -- never relax the gate.
