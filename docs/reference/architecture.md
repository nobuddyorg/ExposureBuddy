# Architecture

What exists and where. Why it is built this way: [design-decisions.md](../explanation/design-decisions.md).
Which test layer proves what: [TEST_STRATEGY.md](../../TEST_STRATEGY.md).

## Shape

ExposureBuddy is a **Next.js App Router static export** served from GitHub
Pages under `/ExposureBuddy/`. There is no server, no backend, no account and
no upload: every photo is decoded, aligned, stacked and rendered inside the
visitor's browser, in Web Workers. The only network traffic after the first
visit is the app shell itself; a service worker stores the shell and the
bundle on that first visit, so the app opens and combines offline.

```text
web/src/app/
  layout.tsx, page.tsx, not-found.tsx, globals.css   app shell and the one screen
  i18n/            dictionaries (de.json, en.json), I18nProvider, useI18n   -- leaf, no app deps
  useTheme.ts      light / dark / system, applied before first paint by an inline script
  useServiceWorker.ts, ServiceWorkerRegistration.tsx    registers public/sw.js
  useWakeLock.ts   keeps the screen on while the pipeline runs
  useLeaveWarning.ts   asks to confirm leaving while a run or an unsaved result would be lost
  components/      React only: AppShell (chrome around every page), Header, Help,
                   PhotoPicker, Progress, Result, PipelineError, ui/ (class helpers, Dialog)
  exposure/        the pipeline as the UI sees it: runPipeline (coordinator), decode, useExposure,
                   deviceProfile (pool size and memory budget), useReferenceSize (for the picker's size line),
                   exifDate + useShotDate (the reference photo's shooting date, written into the export)
  vision/          pure TypeScript over typed arrays -- no React, no Next, no DOM (enforced)
    image/         gray conversion, resize, box blur, integral image, RGB images in row bands, sharpness
    features/      FAST corners, intensity-centroid orientation, rBRIEF descriptors, ORB front door
    matching/      Hamming distance, ratio + cross-check matching
    geometry/      homography algebra, normalised DLT, RANSAC
    warp/          inverse-mapped bilinear warp into RGB bands, with the covered run of each row
    stack/         exposure gain, crop, median / mean / robust backgrounds stack, composite, in-place blur
    pipeline/      memory budget, worker message protocol, pure request handlers
    indices.ts     the row and sample index lists kernels walk, so their loops carry no bound
  workers/         exposure.worker.ts, the one entry point: `self.onmessage` glue over vision/pipeline handlers
web/public/        sw.js (precaches out/precache.json at install), site.webmanifest, icons, logo.svg
web/e2e/           Playwright: page objects, public specs, synthetic burst fixtures
web/scripts/       Node tools: precache-manifest (runs in `npm run build`), serve-export, make-fixtures, make-icons, lighthouse, summaries
```

Layer rules, checked by `dependency-cruiser` and ESLint:

- `vision/` imports nothing from `react`, `next`, `components/` or `i18n/`. It
  runs in a worker, in Node under Vitest, and under Stryker.
- The worker entry point imports only `vision/` and the three browser-bound
  glue files it needs: `exposure/decode.ts`, `exposure/workerScope.ts` and
  `exposure/workerServe.ts`. No React, no UI, no coordinator.
- `i18n/` imports nothing from `vision/` or `components/`.
- `e2e/` and `scripts/` never import `src/app/`; `src/app/` never imports them.

## The pipeline

One burst goes through five stages. Each stage reports progress to the UI as
`{ stage, done, total, frames }`.

1. **Decode.** Every file is decoded in a worker with `createImageBitmap`
   (`imageOrientation: 'from-image'`, so EXIF rotation is applied) and drawn
   onto an `OffscreenCanvas` at the *working size*. The working size comes
   from the reference photo's dimensions, the frame count and the device's
   memory budget (`vision/pipeline/deviceBudget.ts`, `budget.ts`): the
   pipeline's peak,
   `max(frameCount × 3 + 5, 37) × width × height` bytes (every aligned
   frame as RGB, plus the reference copy and one band of output; or the
   stack and two float layers once the frames are gone), must fit the budget, and
   the long edge never exceeds the chosen output size (small 1024, standard
   1600, large 2400).
2. **Reference features.** The middle frame of the burst is the reference
   unless the picker marked another (`usePickedPhotos`, `referencePosition`):
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
   an RGB image in bands of 64 rows and, per row, the one run of columns the
   source covers (a warped rectangle is convex, so a row never covers two
   runs). A per-channel gain estimated over the
   overlap flattens auto-exposure flicker between frames. A frame with too
   few inliers is **skipped**, not guessed at. Every aligned frame, and the
   reference, also reports its **sharpness** at the alignment size
   (`vision/image/sharpness.ts`: the variance of the 4-neighbour Laplacian
   over the variance of the pixels, so exposure does not count). Once all
   are aligned, a frame below 0.7 of the burst's lower median is
   **blurred** (`vision/pipeline/blurred.ts`) and dropped from the stack
   worker before the crop; the reference never is.
4. **Stack.** A dedicated worker keeps every aligned frame. The largest
   rectangle every aligned frame covers, found from the row runs alone,
   becomes the output crop, and only its pixels are stacked: per pixel over
   all frames, four estimates of the static scene
   (`StackResult.backgrounds`: the **median**, a **trimmed** mean of the
   middle half, a **clipped** mean of everything within three MAD-sigmas of
   the median, and the median of the densest 32-level window, the **mode**)
   the **mean** (the long exposure) and the **brightest** value (light
   trails). Stacking walks the crop band by
   band and frees each frame's band once its rows are done, so the frames
   shrink while the result grows.

   When the burst does not fit whole, the plan splits the rows into up to
   eight **strips** (`WorkingPlan.stripRows`, whole bands). Each frame then
   keeps only its first strip on arrival, after its exposure gain is taken
   from the whole frame; the crop still follows from every frame's row runs.
   For every later strip each aligned frame is decoded and warped again,
   only those rows, with the homography its alignment returned, gets the
   same gain, and is stacked before the next strip is fetched. The result is
   the same, bit for bit, as one pass (`runPipeline.strips.test.ts` runs the
   real services both ways); the price is one more decode of every photo
   per strip.
5. **Composite.** From those buffers the result is rendered for the current
   background choice and slider values: `background + ghostStrength ×
   blur(moved − background) + glow × blur(max(moved − background, 0))`, where
   `background` is the estimate picked in `CompositeParams.background` and
   `moved` is the mean, or the brightest value with `CompositeParams.trails`. It
   works one colour channel at a time with the blur done in place, so only
   two single-channel float layers exist at once. It re-runs on every slider
   change in the stack worker, so the aligned frames are never touched again,
   and the canvas shows the new frame within a debounce.

Export draws the composite at working resolution to a canvas and hands the
JPEG to `navigator.share` when the browser can share files, else to a download
link.

### Memory

Everything at working resolution lives in one worker as RGB `Uint8ClampedArray`
bands of 64 rows; the main thread only forwards transferable buffers. Peak
memory is `max(frameCount × 3 + 5, 37)` bytes per working pixel
(`peakBytesPerPixel`):

- while stacking, every aligned frame (3 bytes, no alpha and no coverage
  mask: a frame's coverage is two numbers per row), plus the copy of the
  reference that compare shows and one band of output in flight (5). The
  stack's own 18 bytes (four backgrounds, the mean and the brightest) never add to that
  peak: each output band is allocated as the frames' bands above it are
  freed.
- while rendering, the stack (18), the reference copy (3), two
  single-channel float layers (8), the RGBA output (4) and at most a layer's
  worth of rows the blur saves before overwriting them (4), by which time the
  frames have been released.

While aligning, the align workers add their own share: each holds its photo
decoded at full size (6 bytes per photo pixel with the halved copies on the
way down) and 8 bytes per working pixel. The full-size decodes are paid
first; a pool whose decodes would take more than a quarter of the budget
runs fewer workers. The reference decode plans the pool
(`chooseWorkingSize` returns `alignWorkers`) and the coordinator starts the
remaining align workers only then.

The budget comes from the device (`exposure/deviceProfile.ts`): a quarter of
the memory Chromium reports, within 256 MiB and 2 GiB, or 768 MiB on a touch
device and 1.5 GiB on a desktop where the browser reports none. It is the
input to the working-size choice, so a fifty-photo burst simply comes out
smaller rather than crashing the tab, and the picker shows that size, from
the same plan, before the burst is combined.
`vision/golden.test.ts` holds the kernels to digests recorded before the
bands, row runs and in-place blur were introduced: the saving costs no bit of
the output.

### Worker protocol

`vision/pipeline/protocol.ts` declares the discriminated unions both sides
speak. Every request carries an `id`; every response echoes it. Buffers move
as transferables. There is one worker script, a few lines of glue: every
worker the coordinator starts runs it, and `vision/pipeline/exposureService.ts`
routes each request by type to the align handlers or the stack session, so a
worker's role is only which requests it is sent. The logic lives in
`vision/pipeline/` as pure functions (`analyseReference`,
`alignToReference`) and a `createStackSession()` object, all tested in Node
without a browser. Decoding (`exposure/decode.ts`,
`createImageBitmap` plus `OffscreenCanvas`) is the one step only a browser can
run; the align workers do it so the main thread never touches pixels. The
coordinator (`exposure/runPipeline.ts`) takes a `WorkerFactory`, so its unit
tests drive it with in-process fakes that call those same handlers.

The reference frame is decoded first (its dimensions and the frame count fix
the working size, the align workers and the strips), its features are
computed once, and both go out: the features to every align worker, the frame
itself to the stack worker. Every other frame is decoded, aligned and warped
inside one align worker and then forwarded, still as a transferable, to the
stack worker (`add-frame`), which applies the exposure gain against the
reference and keeps its first strip. `drop-frame` forgets a frame again
that turned out blurred. `crop` then fixes the crop, and
`stack-rows` stacks one strip; between strips, `warp-rows` has every align
worker decode and warp its frames' rows again and `add-rows` hands them to
the stack worker. With one strip that is `crop` and one `stack-rows`, and the
align workers stop before it.

## The screen

One route. Three states of one page, driven by `useExposure`:

| State | Component | Test ids |
| --- | --- | --- |
| Picking photos | `PhotoPicker` | `photo-dropzone`, `photo-input`, `pick-photos`, `photo-tile` (with `data-reference`), `photo-thumb`, `choose-reference`, `remove-photo`, `reference-badge`, `reference-hint`, `photo-count`, `clear-photos`, `quality-select`, `result-size`, `combine`, `picker-notice` |
| Combining | `Progress` | `progress`, `progress-stage`, `progress-bar`, `frame-status`, `cancel` |
| Result | `Result` | `result-canvas`, `result-stats`, `result-skipped`, `result-blurred`, `adjust-toggle`, `background-select`, `trails-toggle`, `ghost-slider`, `blur-slider`, `glow-slider`, `compare-toggle`, `download`, `share`, `start-over` |
| Failed | `PipelineError` | `pipeline-error`, `retry` |

Always present: `Header` (`theme-toggle`, `language-toggle`, `open-help`),
`Help` dialog (`help-dialog`, `help-close`), the footer privacy line.

## Static hosting

- `next.config.ts` sets `output: 'export'`, `trailingSlash: true`, and a
  `basePath` of `/ExposureBuddy` in production builds (the Pages project
  URL; `PAGES_BASE_URL` overrides it for a custom domain).
- `public/sw.js` precaches the shell (`./`, `site.webmanifest`, `logo.svg`)
  and every file in `precache.json` at install, then serves `_next/static/**`
  cache-first and the shell network-first, one cache per build
  (`NEXT_PUBLIC_BUILD_ID`); a new build's worker deletes the previous builds'
  caches and nothing else on the origin. `npm run build` runs
  `scripts/precache-manifest.mjs` after `next build`, which lists
  `out/_next/static/**` without source maps into `out/precache.json`; a
  build without the manifest (`next dev`) logs a warning and caches on
  demand instead. A cached `_next/static` hit goes out as a fresh `Response`
  copy so the request's `#params=` fragment, which Turbopack's worker chunk
  boots from, survives.
- Response headers cannot be set on GitHub Pages, so the CSP is a `<meta>`
  tag and a frame-busting script deters casual framing in place of
  `frame-ancestors` (a sandboxed frame that forbids top navigation defeats
  it; no header is available to close that gap).

## CI/CD

`ci.yml` runs on every pull request and push to `main`: `prek` (hygiene,
typos, gitleaks over the history, zizmor, actionlint, markdownlint), then
`build_and_test` (build, tsc, prettier, eslint, dependency-cruiser, knip,
vitest with coverage, Playwright on chromium / mobile / firefox / webkit-mobile
with e2e coverage), `mutation_test` (Stryker over `mutation-targets.mjs`),
`opengrep` (SAST, error severity blocks), `lighthouse` (against the export
served under its base path) and `zap_baseline` (a passive OWASP ZAP scan of
the export). A local checkout runs Playwright on Chromium only (desktop and
Pixel 7); Firefox and WebKit need the `CI` or `E2E_ALL_ENGINES` variable and
the browsers installed. `pages-deploy.yml` builds and publishes `main` once
CI has passed on it, then runs the Chromium suite against the live site.
