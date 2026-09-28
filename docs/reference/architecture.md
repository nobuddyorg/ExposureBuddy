# Architecture

What exists and where. Why it is built this way: [design-decisions.md](../explanation/design-decisions.md).
Which test layer proves what: [TEST_STRATEGY.md](../../TEST_STRATEGY.md).

## Shape

ExposureBuddy is a **Next.js App Router static export** served from GitHub
Pages under `/ExposureBuddy/`. There is no server, no backend, no account and
no upload: every photo is decoded, aligned, stacked and rendered inside the
visitor's browser, in Web Workers. The only network traffic after the first
visit is the app shell itself, which a service worker caches for offline use.

```text
web/src/app/
  layout.tsx, page.tsx, not-found.tsx, globals.css   app shell and the one screen
  i18n/            dictionaries (de.json, en.json), I18nProvider, useI18n   -- leaf, no app deps
  useTheme.ts      light / dark / system, applied before first paint by an inline script
  useServiceWorker.ts, ServiceWorkerRegistration.tsx    registers public/sw.js
  components/      React only: Header, PhotoPicker, Progress, Result, Help, ui/
  exposure/        the pipeline as the UI sees it: runPipeline (coordinator), decode, useExposure
  vision/          pure TypeScript over typed arrays -- no React, no Next, no DOM (enforced)
    image/         gray conversion, resize, box blur, integral image
    features/      FAST corners, intensity-centroid orientation, rBRIEF descriptors, ORB front door
    matching/      Hamming distance, ratio + cross-check matching
    geometry/      homography algebra, normalised DLT, RANSAC
    warp/          inverse-mapped bilinear warp with a coverage mask
    stack/         exposure gain, median / mean / deviation stack, crop, composite
    pipeline/      memory budget, worker message protocol, pure request handlers
  workers/         *.worker.ts entry points: `self.onmessage` glue over vision/pipeline handlers
web/public/        sw.js, site.webmanifest, icons, logo.svg
web/e2e/           Playwright: page objects, public specs, synthetic burst fixtures
web/scripts/       Node tools: serve-export, make-fixtures, make-icons, lighthouse, summaries
```

Layer rules, checked by `dependency-cruiser` and ESLint:

- `vision/` imports nothing from `react`, `next`, `components/` or `i18n/`. It
  runs in a worker, in Node under Vitest, and under Stryker.
- A `*.worker.ts` file imports only `vision/` and the one DOM-bound step it
  runs, `exposure/decode.ts`.
- `i18n/` imports nothing from `vision/` or `components/`.
- `e2e/` and `scripts/` never import `src/app/`; `src/app/` never imports them.

## The pipeline

One burst goes through five stages. Each stage reports progress to the UI as
`{ stage, done, total, frames }`.

1. **Decode.** Every file is decoded in a worker with `createImageBitmap`
   (`imageOrientation: 'from-image'`, so EXIF rotation is applied) and drawn
   onto an `OffscreenCanvas` at the *working size*. The working size comes
   from the first frame's dimensions, the frame count and a memory budget
   (`vision/pipeline/budget.ts`): `frameCount × width × height × 4` bytes of
   aligned frames must fit the budget, and the long edge never exceeds the
   chosen output size (small 1024, standard 1600, large 2400).
2. **Reference features.** The middle frame of the burst is the reference:
   it minimises the largest camera drift to any other frame. Its grayscale
   copy at the *alignment size* (long edge ≤ 960) goes through ORB:
   FAST-9 corners with non-maximum suppression, bucketed on a grid so the
   corners spread over the whole frame, an intensity-centroid orientation,
   and 256-bit rotated BRIEF descriptors.
3. **Align.** A pool of workers (`min(hardwareConcurrency - 1, 4)`, at least
   1) takes one frame each: same ORB features, brute-force Hamming matching
   with Lowe's ratio test and cross-check, RANSAC over a normalised-DLT
   homography with a 3 px inlier threshold, least-squares refinement on the
   inliers, and a sanity check on the model (scale, skew and perspective
   bounds). The homography is scaled to working coordinates and the frame is
   inverse-warped into the reference frame with bilinear sampling, producing
   an RGBA image and a coverage mask. A per-channel gain estimated over the
   overlap flattens auto-exposure flicker between frames. A frame with too
   few inliers is **skipped**, not guessed at.
4. **Stack.** A dedicated worker keeps every aligned frame and computes, per
   pixel over the frames that cover it: the **median** (the static scene),
   the **mean** (the long exposure) and the largest per-channel **mean
   absolute deviation** from the median (how much the pixel moved). The
   largest rectangle every aligned frame covers becomes the output crop.
5. **Composite.** From those three buffers the result is rendered for the
   current slider values: `median + ghostStrength × blur(mean − median) +
   glow × blur(max(mean − median, 0))`. It re-runs on every slider change in
   the stack worker, so the aligned frames are never touched again, and the
   canvas shows the new frame within a debounce.

Export draws the composite at working resolution to a canvas and hands the
JPEG to `navigator.share` when the browser can share files, else to a download
link.

### Memory

Everything at working resolution is a `Uint8ClampedArray` in one worker; the
main thread only forwards transferable buffers. Peak memory is roughly
`frameCount × working pixels × 4` for the aligned frames plus three
working-size buffers for the stack. The budget defaults to 256 MiB and is the
input to the working-size choice, so a fifty-photo burst simply comes out
smaller rather than crashing the tab.

### Worker protocol

`vision/pipeline/protocol.ts` declares the discriminated unions both sides
speak. Every request carries an `id`; every response echoes it. Buffers move
as transferables. The workers themselves are a few lines of glue each; the
logic they call lives in `vision/pipeline/` as pure functions
(`referenceFeatures`, `alignToReference`) and a `createStackSession()`
object, all tested in Node without a browser. Decoding (`exposure/decode.ts`,
`createImageBitmap` plus `OffscreenCanvas`) is the one step only a browser can
run; the align workers do it so the main thread never touches pixels. The
coordinator (`exposure/runPipeline.ts`) takes a `WorkerFactory`, so its unit
tests drive it with in-process fakes that call those same handlers.

The reference frame is decoded first (its dimensions and the frame count fix
the working size), its features are computed once, and both go out: the
features to every align worker, the frame itself to the stack worker. Every
other frame is decoded, aligned and warped inside one align worker and then
forwarded, still as a transferable, to the stack worker, which applies the
exposure gain against the reference and keeps it.

## The screen

One route. Three states of one page, driven by `useExposure`:

| State | Component | Test ids |
| --- | --- | --- |
| Picking photos | `PhotoPicker` | `photo-dropzone`, `photo-input`, `pick-photos`, `photo-thumb`, `photo-count`, `clear-photos`, `quality-select`, `combine`, `picker-notice` |
| Combining | `Progress` | `progress`, `progress-stage`, `progress-bar`, `frame-status`, `cancel` |
| Result | `Result` | `result-canvas`, `result-stats`, `ghost-slider`, `blur-slider`, `glow-slider`, `compare-toggle`, `download`, `share`, `start-over` |
| Failed | `PipelineError` | `pipeline-error`, `retry` |

Always present: `Header` (`theme-toggle`, `language-toggle`, `open-help`),
`Help` dialog (`help-dialog`, `help-close`), the footer privacy line.

## Static hosting

- `next.config.ts` sets `output: 'export'`, `trailingSlash: true`, and a
  `basePath` of `/ExposureBuddy` in production builds (the Pages project
  URL; `PAGES_BASE_URL` overrides it for a custom domain).
- `public/sw.js` caches `_next/static/**` cache-first and the app shell
  network-first, one cache per build (`NEXT_PUBLIC_BUILD_ID`); a new build's
  worker deletes the previous builds' caches and nothing else on the origin.
- Response headers cannot be set on GitHub Pages, so the CSP is a `<meta>`
  tag and a frame-busting script stands in for `frame-ancestors`.

## CI/CD

`ci.yml` runs on every pull request and push to `main`: `prek` (hygiene,
typos, gitleaks over the history, zizmor, actionlint, markdownlint), then
`build_and_test` (build, tsc, prettier, eslint, dependency-cruiser, knip,
vitest with coverage, Playwright on chromium / mobile / firefox / webkit-mobile
with e2e coverage), `mutation_test` (Stryker over `mutation-targets.mjs`),
`opengrep` (SAST, error severity blocks), `lighthouse` (against the export
served under its base path). `pages-deploy.yml` builds and publishes `main`
once CI has passed on it, then runs the Playwright suite against the live
site.
