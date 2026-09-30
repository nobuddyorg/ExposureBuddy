# Test strategy playbook

A portable testing strategy for one shape of app: a **Next.js static export
with no backend**, whose whole product is **client-side computation in Web
Workers** over the user's own files. It says what each test layer can and
cannot prove in that architecture, and which layer owns which behavior. Copy
it into a new project of the same shape, then localize it (§16). **This file
names no real file path, module, or measured number** — those belong in the
project's own docs.

Two meta-rules: **disagree in the open rather than departing quietly** — if a
task needs something this strategy rules out, say so first — and **update this
file the moment the architecture moves**; a stale strategy produces false
confidence at exactly the layer nobody double-checks.

Vocabulary used throughout: a *kernel* is a pure function over typed arrays
(pixels in, pixels or numbers out); the *pipeline* is the sequence of kernels
one input goes through; a *worker* is the browser thread a stage of the
pipeline runs on; the *shell* is the HTML, CSS and JavaScript the static host
serves; a *fixture* is a synthetic input whose correct output is known.

---

## 0. When this applies

- The frontend ships as static files. There is no server runtime, no
  database, no account and no upload: the only inputs are files the visitor
  picks, and the only output is what the browser renders and saves.
- The product's value is computation, not data: the same input must always
  produce the same output, and a wrong output can look plausible.
- The computation runs in Web Workers, on browser APIs (canvas, image
  decoding, transferable buffers) whose behavior differs between engines.
- There is no staging; a merge to the deploying branch publishes.

If a server-side surface appears — an upload endpoint, a function that
processes a file remotely, a sync of results between devices — the central
claim (**the only hostile input is a malformed or oversized file, and the
only silent failure is a wrong result**) stops holding for that surface.
Rethink this document there; don't patch it.

---

## 1. Purpose

Put each check at the cheapest level that would actually catch the failure it
is aimed at. This needs writing down because the product is a number: a kernel
with a sign error, an off-by-one at an image border, or a median that quietly
returns the mean produces an image that looks like a result, passes every UI
test, and is wrong. No user reports it, no log records it, no second system
disagrees with it. A strategy that only describes what is already green is not
a strategy — name the gaps (§16).

---

## 2. System testing context

### Map the shape, for the real project

Write this into the project's own docs with its real pieces:

| Piece | Testing consequence |
| --- | --- |
| Next.js static export | No server to unit-test; every page is prerendered HTML plus a browser bundle, and a prerender can pass while the bundle fails |
| Static host / CDN | Deployment failures are path failures (base path, asset URLs, manifest scope) — needs a real fetch against the deployed origin |
| Web Workers | Message-passing glue around pure handlers; the glue only exists in a browser, the handlers must not depend on one |
| Canvas, `createImageBitmap`, `OffscreenCanvas` | The one step (decoding a file to pixels) only a browser can run, and where engines differ most |
| Typed-array kernels | Pure, deterministic, testable in Node — and the place a wrong answer hides |
| File API | The only input channel; hostile input is a file that is not an image, is huge, or carries orientation metadata |
| Service worker | Caches the shell; can serve a stale shell that names assets the host no longer has |
| CI/CD | Holds the deploy token and the coverage upload token; the highest-privilege *code* is shell in a workflow, not app code |

### Trust boundaries to enumerate

1. **The visitor's own files → the pipeline.** The only untrusted input. The
   threat is not another user but a malformed, enormous or oddly-oriented
   file: the pipeline must refuse, shrink, or rotate it, never hang or crash
   the tab.
2. **The pipeline → the screen.** A wrong kernel crosses this boundary as a
   plausible image. Only a fixture with a known answer can see it.
3. **Main thread ↔ workers.** A message protocol with transferable buffers; a
   buffer moved twice, or a response with the wrong id, is a silent hang or a
   frame attributed to the wrong input.
4. **Static host → browser.** Base path, CSP delivered as markup rather than
   headers, service-worker scope. Covered by the browser suite against the
   built artifact, and post-deploy against the live origin.
5. **CI/CD → the live site.** Covered by workflow-scanning tools and review,
   not by a test.
6. **App → the network.** Nothing but the shell itself. For the document,
   enforced by a CSP with no foreign origin and checked by a passive scan;
   for the workers, which a static host cannot hand a CSP of their own,
   enforced by the module-boundary rule that the pipeline layer imports
   nothing that reaches the network, and by review. A request carrying
   pixels anywhere is a design violation, not a bug.

---

## 3. Testing principles

1. **Correctness is a fixture with a known answer.** A kernel is tested on a
   synthetic image whose right output is computed independently, never on a
   real photo whose right output is a matter of taste.
2. **Never mock the thing that carries the risk.** Faking the worker is fine
   (it is glue); faking the kernel it calls tests nothing.
3. **Coverage is a signal; mutation score is stronger.** A line of a kernel
   ran proves nothing about the number it produced.
4. **Lowest level with the same confidence.** The warp's arithmetic is a unit
   test; *that the pipeline warps* is one browser case, not one per slider.
5. **Deterministic or deleted.** Randomness (feature sampling, RANSAC) is
   injected through a seeded generator. No retries except the post-deploy
   smoke test, where a retry distinguishes a broken deploy from a dropped
   connection. A flake is a defect.
6. **Test the failure paths.** Anything that skips-and-continues, is
   cancellable, or degrades under a budget carries a silent-wrong-result
   risk — inject the failure and assert what the user sees.
7. **If it is hard to test, fix the design.** A stage that needs a browser
   to be tested is a stage whose logic has not been separated from its glue.
8. **Measure, don't assume.** A kernel's cost is a number a benchmark
   prints, stated with the resolution and the frame count; memory is a
   number a budget function computes.
9. **One new behavior, one new assertion, at one level.**
10. **A rewrite that must not change the output is held to digests.** When
    a kernel is restructured for memory or speed, digests of its outputs on
    seeded inputs are recorded from the old code first and asserted against
    the new (`vision/golden.test.ts`); the digests change only with a change
    the output is meant to have.

---

## 4. Risk model — a template, not a checklist

Rank by expected cost. "Cheapest meaningful test" is the level below which the
risk is uncovered. Replace the rows with the real project's kernels, stages
and screens:

| Risk | Cost | Cheapest meaningful test |
| --- | --- | --- |
| **A wrong kernel producing a plausible image** — a sign, an index, a border, a channel swapped | Silent, total correctness failure; UI looks fine | Unit test on a synthetic image with a known answer, mutation-scored; a browser fixture with ground truth as the end-to-end proof |
| **A geometry estimate that fits the moving object instead of the scene** | The still scene blurs; looks like camera shake | Unit test with planted outliers; a fixture with a mover and a known transform |
| **Memory exhaustion on a phone** | The tab is killed with no message | The budget function tested as arithmetic; a working size that shrinks with the frame count, asserted in the browser on a big synthetic burst |
| **Browser API divergence** (Chromium, Gecko, WebKit) in decoding, canvas, workers, file inputs | A whole engine's users get an error or a wrong image | The browser suite on every engine, on real fixtures |
| **Orientation metadata ignored or applied twice** | Rotated or mirrored output | A fixture carrying orientation, decoded in the browser and compared to the known scene |
| **A stale shell from the service worker** | The app fails to load after a deploy until a manual reload | A browser case that installs the worker, swaps the build, and reloads |
| **Base-path faults** | A site that quietly 404s post-deploy | Serve the real artifact under its real path, locally and deployed |
| **A worker-protocol fault** (wrong id, buffer moved twice, an error swallowed) | A hang or a frame credited to the wrong input | Unit tests on the pure handlers with in-process fakes; a cancellation case in the browser |
| **A frame silently blended in although it did not align** | A blurred scene that looks like a bad shot | Unit test on the skip rule; a browser fixture with an unalignable frame that must be reported |
| **Performance regression in a kernel** | The app is usable on a laptop and not on a phone | A benchmark in Node stated per resolution; a budget on the shell in the browser |
| **Accessibility regressions** | Unusable with keyboard or screen reader | Static lint + runtime axe — §9 |
| **PWA install or offline regression** | The installed app does not open, does not combine, or opens stale | Manifest and icons fetched at the deployed path; in the browser suite, one visit, then offline: the app opens and combines a burst |
| **Export corruption** | A file that does not open where it is sent | A browser case that reads the saved bytes back and checks the format |
| **A pixel leaving the device** | The product claim is false | CSP with no foreign origin; a passive scan; review — no test can prove a negative here |

Keep 10–20 rows, each marked covered / partly / not covered, updated as
incidents happen.

---

## 5. Test layers

| Layer | Verdict | Why |
| --- | --- | --- |
| Unit on kernels, with properties | **Required, mutation-scored** | The only level where a wrong number is a wrong number and not a plausible image. |
| Component / hook | **Required** | Hydration mismatches, missing a11y attributes, a control that never disables, a state the hook never leaves — invisible to kernel tests. |
| Pure-handler tests with faked workers | **Required** | The protocol, ids, transfers, skips and cancellation, driven in-process; the browser adds nothing here but cost. |
| Browser suite on real engines, WebKit included | **Required** | Decoding, canvas, workers and file inputs differ between engines; a Chromium-only suite is a Chromium-only product. |
| Synthetic-fixture correctness in the browser | **Required** | The only end-to-end proof the algorithm works: a burst with a known scene must come out as that scene, within a tolerance. |
| Visual regression (screenshot diffs) | **Not adopted** | The result is a computed image with a known answer, so a tolerance-based comparison against ground truth is stronger and does not break on a font change; the shell's look is cheap to eyeball and gated by axe and Lighthouse instead. |
| Property-based | **Required, narrow** | §10. |
| Mutation | **Required, scoped** | §11. |
| Load / backend | **n/a** | There is no backend; load is one visitor's own burst, bounded by the budget. |
| Dynamic scanning (DAST) | **Narrow passive scan** | Of the static export: markup-delivered CSP, error text in HTML; never an active scan, never against the live site. |
| Deployment | **Required** | The built artifact served under its real base path. |
| Smoke | **Required** | The suite against the deployed origin: a prerender masks failures only a browser bundle shows. Read-only by construction, so the whole suite may run. |
| Production synthetic | **Optional** | Duplicates smoke. |

### Who owns which behavior — and who does not

| Behavior | Owning layer | Not this |
| --- | --- | --- |
| Kernel arithmetic (conversion, resize, blur, features, matching, geometry, warp, stacking, compositing, the budget) | Unit + property + mutation | Not the browser |
| The pipeline's decisions: reference choice, skip rule, gain, crop, progress reporting, cancellation | Pure-handler tests with faked workers | Not the browser, except one journey |
| Rendering, disabled states, focus, keyboard paths, a11y attributes | Component | Not E2E, unless the journey depends on it |
| Decoding a file to pixels, orientation, canvas export | Browser suite | Not unit — it does not exist in Node |
| The algorithm's end-to-end correctness on a known scene | Browser fixture with ground truth | Not a screenshot |
| Engine divergence | Browser suite on every engine | Not one engine plus hope |
| Base path, icons, manifest, service worker, pre-hydration behavior | Browser suite; also post-deploy | Not unit alone |
| One complete user journey | E2E | Not one case per slider |
| Repo tooling outside the bundle | The job that depends on it; a build script whose output ships (the precache manifest) also gets a unit test on its selection | Not bundle coverage |

---

## 6. Architecture-specific strategy

### The shape of the pyramid

The base is unusually wide and unusually valuable, because the product is
the kernels:

```text
Layer                              Weight           Runs against
---------------------------------  ---------------  --------------------------------
Unit on kernels + properties       most of it       synthetic arrays; all of it
                                                      mutation-scored
Pure handlers with faked workers   a wide band      in-process fakes calling the
                                                      real kernels
Component / hook                   moderate         jsdom
Browser, every engine              one per journey  built artifact; real fixtures
Browser, post-deploy               the same suite   live origin, one engine
```

Two ways it drifts: a kernel landing without a known-answer test (the
correctness proof silently leaving coverage), or the browser suite asserting
arithmetic a unit test could have settled in milliseconds.

### What must be real, and what may be faked

| Thing | Unit / component | Browser suite |
| --- | --- | --- |
| Kernels | **Real** — never simulated | Real |
| Workers | Faked through an injected factory whose fakes call the real handlers in-process | **Real** |
| Canvas, `createImageBitmap`, `OffscreenCanvas` | Faked behind an injected decoder | **Real** |
| File inputs | A Blob in memory | **Real**, through the input element |
| Randomness | Injected, seeded | Seeded through the same parameter |
| Clocks, timers | Injected or faked | Real |
| The static host | Absent | **Real**: the export served under its base path, then the deployed origin |
| The network | Absent | Real, and expected to carry nothing but the shell |

The rule that makes this work: **every worker entry point is a few lines of
glue over a pure handler, and every browser-only step is one function behind
an injected parameter.** Glue is verified by the browser suite; handlers by
unit tests. A handler that reaches for a browser global has crossed the line
and fails the layer rule, which a module-boundary checker enforces.

### Where the browser-only steps live

Decoding a file to pixels is the one step Node cannot run. Put it in the
worker, not on the main thread, so the main thread never touches pixels; make
it one function with one signature; fake it in every unit test; exercise it
on every engine in the browser suite, with a fixture that carries orientation
metadata. Everything after it — the whole pipeline — is typed arrays and runs
anywhere.

### Static analysis layering

Four tools answer four different questions; none stands in for another:

1. **Module-boundary graph** (dependency-cruiser): the kernel layer imports
   nothing from the UI, the framework or the DOM; worker entry points import
   only the kernels and their one browser-bound step; the bundle never imports
   Node-only tooling. A single-file linter cannot see an *indirect* reach
   through another module. Also: no cycles, no orphans.
2. **Dead code / unused dependencies** (knip). Anything referenced only as a
   string in another tool's config, or started by URL (a worker), gets an
   explicit entry point.
3. **General-purpose SAST** (Semgrep/Opengrep). Block on error severity,
   surface the rest for triage. Every suppression carries its reason at the
   suppression.
4. **Code-smell linter** (cognitive complexity, duplication). A kernel over
   typed arrays is legitimately dense; tune thresholds against the project's
   own code, and let a comment name the invariant rather than split a hot
   loop for the linter's sake.

Measure run time before placement: seconds-scale belongs in a pre-commit gate;
a network fetch or cold binary install belongs in CI only.

### Dynamic scanning (DAST)

A **passive baseline scan** (spider plus passive rules, never an active attack
scan) against an isolated local build of the export is the only layer that
sees a markup-delivered CSP regress or error text leak into rendered HTML.

- There is nothing to sign in to and no form that posts anywhere, so one
  pass over the built export is the whole scan.
- Never against the deployed site.
- A header the static host cannot set stays explicitly ignored, with the
  reason written down — not silently unaddressed.
- Graduated severity: a small blocking set (what an export *can* get wrong),
  the rest for triage.

---

## 7. Correctness of the image pipeline

**The highest-value testing in this architecture.** No second system checks
the output; a wrong kernel fails silently and looks like a result. A test that
the pipeline *finished* is never evidence that it was *right*.

### Rules

1. **Ground truth is synthetic.** A test scene is generated: a textured
   background, a known object moving through it, a known transform and gain
   per frame, a known amount of noise. The right answer is computed from
   those parameters, not read off a previous run.
2. **Known transforms, both ways.** A frame made by applying a transform to
   the scene must be brought back by the estimated transform; the estimate is
   compared to the parameter that generated it, within a tolerance in pixels
   at the image corners, not in matrix entries.
3. **Tolerance-based assertions, with the tolerance justified.** Resampling,
   quantisation and noise mean the output is never bit-identical to the
   ground truth. Assert a mean absolute difference over a region below a
   floor, and write down why the floor is where it is; an assertion with a
   tolerance nobody can explain is an assertion nobody can defend.
4. **Assert on the region that carries the claim.** The band the mover
   crossed proves the mover was removed or ghosted; the static region proves
   the alignment. A whole-image difference averages the two into nothing.
5. **Assert the contrast, not only the level.** With the effect off, the
   region matches the clean scene; with it on, the region differs by more
   than a margin. A pipeline that ignores the control passes the first alone.
6. **Plant the failure.** A frame from another scene must be reported as
   skipped and absent from the output; a moving object must not pull the
   estimate; a frame with too few features must fail the frame, not the run.
7. **Test every border.** A kernel's off-by-one lives at the edge of the
   image, at the last row, at an odd width, at a one-pixel image. Every
   kernel gets those inputs.

### The reference-frame coordinate trap

Every transform has a direction and a coordinate system, and the pipeline
uses at least three: the frame's own pixels, the reduced size features are
detected at, and the working size the output is rendered at. A transform
estimated at one scale and applied at another must be rescaled; a transform
that maps *source to reference* must be inverted to *pull* pixels for an
inverse warp; and a test that generates a frame *from* the scene and then
checks the estimate *against* that transform has to know which of the two the
estimator returns.

Getting one of these wrong produces an output that is nearly right for small
motions — which is exactly the case most fixtures exercise — and wrong for the
motions users produce. So the fixtures include a transform large enough that
the mistake shows (a rotation and a scale, not only a shift), the property
tests include the round trip through the inverse, and every function's
contract states the direction and the coordinate system of what it returns.

### Two levels of correctness test

- **Unit**, per kernel, on tiny arrays with hand-computable answers and on
  generated ones with a property: fast enough to run on every change and
  precise enough to be mutation-scored.
- **Browser**, per journey, on a generated burst with ground truth: proves
  the kernels compose, that decoding and orientation did not undo them, and
  that the screen shows what the pipeline produced. Slow, and the only place
  a real image decoder is involved.

A kernel change ships its unit case in the same change. The browser fixture
alongside is required for a change to what the pipeline does with a frame,
but does not discharge the unit case: its tolerance is wide enough to pass a
kernel that is subtly wrong.

### Out of scope

The subjective quality of a result on a real photograph (a matter of taste,
judged by eye); penetration testing the hosting platform; secret scanning
beyond a dedicated hook and the platform's own tooling.

---

## 8. Fixtures

### Generated, deterministic, never committed

- **A seeded generator writes every fixture** from parameters: scene, size,
  frame count, motion range, noise. The same seed produces the same bytes on
  every machine, so a failure reproduces as it stands.
- **The generator records the answer** beside the frames: every frame's
  transform and gain, the mover's path, the reference index. The tests read
  the answer from there rather than recomputing it.
- **Nothing generated is committed.** Binary fixtures in version control are
  megabytes that change whenever the scene does and can never be reviewed.
  The generator is code, reviewed as code; CI regenerates before every run
  that reads fixtures, and the pre-merge checklist says so.
- **Small.** A few hundred pixels on the long side is enough to exercise
  every kernel and every border; a full-size phone photo is a benchmark
  input, not a test input.
- **Include the hostile ones.** A file that is not an image, a burst of
  unrelated scenes, a single frame, a burst above the accepted count, a frame
  carrying orientation metadata.

### Setup that must not be weakened

- **Fail on an unexpected console or runtime error.** This catches a worker
  error swallowed behind a passing assertion.
- **Flush browser coverage before every full navigation.** V8 keeps counts
  only for the live document; a reload or `goto` discards everything the
  test did before it, silently.
- **Read function coverage, not line coverage, when deciding what a browser
  suite never reached.** Minified bundles map function starts reliably and
  block ranges inside async bodies poorly.
- **Poll for expected state wherever the UI debounces or waits on a
  worker.** An assertion straight after a slider change reads the previous
  render.

### Not here

Pure logic already covered at unit level. A unit test finds a wrong blur
radius in milliseconds; the same point through a browser and a real decoder
costs orders of magnitude more.

---

## 9. E2E strategy

One suite, safe against any origin because nothing it does leaves the
browser: the shell (base path, manifest and icons, the service worker,
pre-hydration theme and language, help, more than one viewport), and the
journeys (a burst through the pipeline to a saved file; the error screen and
its retry; cancellation). Every engine the product supports is a project, and
a phone viewport is a target, not a variation.

A UI change gets one E2E case for its journey; field-level detail (disabled
states, validation wording, focus order) belongs in component tests. Poll for
expected state wherever the UI debounces or waits on a worker.

### How the browser suite addresses the UI

Pick the locator that matches what the test is about, and record the
project's default:

- **Accessible locators** (`getByRole`, `getByLabel`) when the test is about
  what a user sees and does. A control a role-based locator can't find, a
  screen reader can't find either.
- **Stable test ids** (`data-testid`) where they carry a deliberate benefit: a
  repeated card or row, an element whose name is translated or user-supplied,
  an attribute-state assertion (`disabled`, `aria-current`, `lang`), a suite
  that must survive copy edits across locales.
- **Never CSS class or DOM structure.**
- **Text that is the subject is asserted, not located by** — finding an element
  by the text you then assert is circular.
- **A third party's DOM** is reached the way it allows, inside the page
  object, with a one-line comment.

**One page object per screen, all hung off one tree.** Each screen exports
`init<Screen>(page)` returning its root locator as a callable, plus `locators`
(grouped handles) and `do` (whole interactions); a repeated row or card gets a
nested object of the same shape:

```ts
export function initResourceList(page: Page) {
  const root = page.getByRole('main');
  const locators = {
    buttons: { newResource: root.getByRole('button', { name: /new/i }) },
    cards: root.getByTestId('resource-card'),
  };
  const interactions = {
    addResource: async (title: string) => {
      await locators.buttons.newResource.click();
      await page.getByLabel(/title/i).fill(title);
      await page.getByRole('button', { name: /save/i }).click();
      await expect(locators.cards.filter({ hasText: title })).toBeVisible();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
```

A tree of getters collects the screens, a fixture hands it to every spec, and
a spec reads as the journey it is:

```ts
test('files a resource and finds it again', async ({ on, page }) => {
  const app = on(page);
  await app.resources.do.addResource('Title');
  await expect(app.resources.card('Title').locators.title).toHaveText('Title');
});
```

Four rules keep this from decaying:

- **No spec names a selector.** Grep the spec directory for `getByTestId`,
  `getByRole`, `locator(`; only document-level elements (`html`, `body`,
  `meta`, `link`) may show up.
- **`do` holds whole actions; `locators` holds handles.** An action spanning
  two screens belongs to the screen that starts it.
- **Waiting belongs to the page object.** `open()` returns when the screen is
  there, not when the click landed. No spec carries a sleep.
- **Assertions belong to the spec.** A page object asserts only its own
  action's postcondition.

### Reading pixels from the page

The result is a canvas. A page object reads its backing store (what the
pipeline drew, at its resolution, not the CSS size) and hands the spec either
the pixels, for a ground-truth comparison, or a cheap digest, for "did it
change". A render that happens in a worker after a debounce is waited for by
the page object: a changed digest, then two identical reads of it.

### Accessibility

**Static** (a JSX a11y linter) catches missing alt text, invalid ARIA, an
unlabeled control before anything renders. **Runtime** (axe-core in the browser
suite) catches computed contrast, real focus order, accessible-name computation
— on representative states, not every route. Decide which severities block;
treating every finding as blocking gets the gate disabled the first time it
catches something ambiguous. Neither proves compliance or screen-reader
behavior: a clean run is "no known regression," and the docs say so.

---

## 10. Property-based testing strategy

Kernels are where properties are easy to state and inputs are genuinely
unbounded, so properties are adopted up front rather than after a near-miss:

- **Round trips.** A transform applied and then inverted returns the point,
  within floating-point tolerance; a resize to the same size is the identity;
  a warp by the identity is the input.
- **Consistency with a brute-force definition.** An integral image's
  rectangle sum equals the naive sum; a box blur equals the naive window
  average at every pixel of a small image.
- **Order statistics.** A median is a member of its input, lies between the
  minimum and the maximum, and is invariant under permutation of the frames.
- **Invariants of the budget.** The chosen size never exceeds the source,
  never exceeds the cap, and the byte formula never exceeds the budget unless
  the floor forced it.
- **Symmetry.** A distance is symmetric and zero on identical inputs; a gain
  estimated between identical frames is one.

Seeded and deterministic, one dependency, beside the example tests rather
than replacing them, inside the unit suite's time budget: generated images
stay small, and a property over a kernel runs in the same seconds as the
examples. A property that fails prints its seed and a shrunk counterexample;
the seed is replayable through one environment variable.

---

## 11. Mutation testing strategy

**Required, scoped — never the whole codebase.**

- One short, explicit file list, shared with the per-file coverage floor so
  the two can't drift: every kernel, and the pipeline's orchestration where
  workers and browser steps arrive through injected parameters.
- Every listed file is pure logic, or I/O reached through an injected
  parameter so a test can drive it and assert the message it composed. Prefer
  that over exclusion regions; any exclusion carries its reason at the
  exclusion.
- **Never mutate the rendering layer.** JSX mutants are near-equivalent by the
  thousand. A file that can't split into logic and rendering is the problem.
- Run on every change touching scoped files. A scoped run is fast; learning
  after the merge that a test asserts nothing is too late.
- Incremental reuse of earlier results is fine on a change, provided the
  branch that deploys reruns everything: the tool's diff sees mutated code and
  tests, not what the mutated code imports, nor a dependency bump. Key the
  saved results on what it cannot see.

Kernels produce a particular survivor class: **a boundary mutant at an image
edge** (`<` to `<=` on the last row, a radius off by one) that no test at the
image's interior can see. The kill is a test at the edge with a known answer,
which is the test §7 already requires. Another is **a mutant in a hot loop
that changes only speed** (an unrolled iteration, a cached stride); if the
output is unchanged, the code was an optimisation, and the honest ending is a
benchmark that names its cost, not a test that pins its shape.

A surviving mutant has two honest endings: **a missing assertion** (kill it
with a real behavioral test, usually an unpinned boundary or error path), or
**equivalent**. For an equivalent mutant, first ask whether the code needs to
exist — a guard the type system already discharges, a default spelled out, a
wrapper every caller unwraps. Deleting that code is the ending that pays for
the exercise. What genuinely remains is left visible in the report with its
reason written down, never hidden behind a suppression. Never write a test
that can't fail just to kill a mutant.

Two structural survivor classes in React: an empty dependency array (the tool
replaces it with a constant React reads as unchanged — drop the memoization if
it isn't load-bearing, otherwise leave the survivor visible), and a timeout (a
counter driven backwards, or a fake that answers every call identically —
iterate over the thing being counted, or back the fake with a finite table).

Below threshold fails the build. Above threshold but below 100% is not a pass;
every survivor is an open question.

---

## 12. Performance and resilience testing

### Performance

**A kernel's cost is measured in Node and stated per resolution.** A benchmark
runs the kernel on a generated image at each working size the product offers
and prints milliseconds per frame; a change to a kernel quotes the before and
after, with the resolution and the frame count. This is a measurement, not a
gate: CI runners vary too much for a millisecond threshold to mean anything,
and a gate that flakes is a gate that gets removed. Regressions are caught by
the number in the PR, and by the rule that a claim of speed names its
resolution.

**Memory is arithmetic.** The working size comes from a budget function that
takes the frame count, the source size and a byte budget; it is tested as
arithmetic (the formula never exceeds the budget, the size never exceeds the
source or the cap, the floor holds) and its inputs are named in the docs.
The behavior it produces — a bigger burst comes out smaller, never crashes —
is asserted once in the browser on a large synthetic burst.

**The shell benefits from a numeric gate** (Lighthouse CI): against the
production export served under its real base path, never a dev server; the
first screen, before any worker starts, so the score is about the shell;
gate on performance, and assert accessibility at a perfect score as a second
lens on §9's tooling; median of several runs; **thresholds from a measured
baseline with margin**, never the tool's defaults or the exact measured value.
When a measurement reveals something worth understanding, write down why the
threshold sits where it does.

### Resilience

Failure injection at unit level, through fakes the modules already accept: a
worker that answers with an error for one frame; a frame that fails to decode;
a burst where every frame but the reference fails to align; cancellation
between any two stages; a budget so small the floor is reached. Each has a
decided, tested answer that reaches the screen with its cause. Injecting into
a real worker is rarely worth it once these branches are reachable with a
fake; the browser suite keeps one cancellation case and one error-screen case
as proof the glue forwards what the handlers decide.

---

## 13. CI/CD execution strategy

1. **Fast hygiene first** — file hygiene, secrets, workflow linting, prose
   linting gate everything else, so a bad config fails before minutes are
   spent on browsers.
2. **Path-filter heavy jobs on PRs.** A job skipped by its own condition
   reports as passing and never weakens branch protection.
3. **Full, unconditional set on the branch that deploys**, whatever the push
   touched, and the deploy starts only once that run has passed on the same
   commit.
4. **Regenerate fixtures before every run that reads them**; nothing
   generated is in the repository.
5. **Every engine in CI.** Local runs may lack an engine whose download is
   blocked; the run that counts installs them all.
6. **Deploy pipeline fails safe**: gate on the tip's CI, build, publish,
   smoke-test — each depending on the last. With no database there is
   nothing to migrate, so a rollback is a revert.
7. **Retry only the deploy-target smoke test.** Everywhere else `retries: 0`.
8. **The deployed bundle ships no source maps**; the CI build that feeds
   browser coverage does, through one variable the deploy never sets.

**Dependency updates:** grouped, on a cooldown, reviewed. A package that only
reaches the CI runner is a smaller risk than one that reaches every visitor's
browser, and that asymmetry is a security control only if it is true: keep
everything the build loads in the runtime section of the manifest, install
without lifecycle scripts, and let the module-boundary check keep Node-only
tooling out of the bundle.

---

## 14. Quality gates

Every gate needs a stated reason; a gate without one gets loosened the first
time it is inconvenient.

| Gate | Guidance |
| --- | --- |
| Coverage floor | A **floor** set from what the suite achieves, with margin — not a target. Raised by hand. A separate, per-file floor of 100% on every mutation target, because a kernel's uncovered line is an untested number. |
| Auto-ratcheting coverage | **No.** It makes a green local run produce a red PR. |
| Mutation score | A break threshold just below the measured score, so one new equivalent mutant can't block unrelated work. Survivors above it remain open questions. |
| Any threshold | **Never lowered** to pass a build. Redesign, or raise the question. |
| Gate scope | A gate is required when the diff touches its inputs. Comments, docs and file moves produce no new mutant or bundle, so the gates that read those inputs are not required for such a change; CI's path filter is the executable form of the same rule. |
| Test pass rate | 100%, `retries: 0` except the deploy-target smoke test. |
| Correctness | A kernel change ships its known-answer unit case; a change to what the pipeline does with a frame ships or updates the browser fixture case (§7). |
| Engines | The browser suite passes on every supported engine before merge. |
| Deployment | Post-deploy smoke green against the **live** origin. |
| Performance | A kernel change quotes its measured cost per resolution; a shell budget from a measured baseline (§12). |
| Static analysis | Block on real findings, surface the rest (§6). |
| Suppressions | Only with the reason written at the suppression, after understanding the failure. |
| New UI | An E2E case for the journey, component coverage for field detail. |
| New behavior | A unit test; pipeline behavior additionally §7. |

---

## 15. Test anti-patterns

Each of these passes silently or looks like flake when it is a defect.

1. Asserting that the pipeline finished, and calling it a correctness test.
2. A real photograph as a fixture, with "looks right" as the expected value.
3. A screenshot diff of a computed image whose right answer is known.
4. Mocking a kernel to make a pipeline test fast.
5. A tolerance chosen to make the current output pass, with no reason written
   down.
6. A whole-image difference where the claim is about one region.
7. A kernel tested only at the interior of the image.
8. Randomness read from a global instead of an injected, seeded generator.
9. A browser suite on one engine for a product that runs on three.
10. A frame that failed to align blended in by a test fixture that never
    looks.
11. Retries or sleeps to paper over a flake.
12. Pure logic re-tested through the browser.
13. A threshold lowered, or a suppression added, to get to green.
14. A test written to touch a line, a branch added to dodge a mutant, a file
    excluded to avoid dealing with it.
15. Mutation scope widened to the rendering layer.
16. A generated fixture committed to the repository.
17. A speed claim without a resolution and a frame count.
18. An E2E case for a field-level detail.
19. An element located by CSS class, DOM position, or the text the test then
    asserts.

---

## 16. Adapting and maintaining this playbook

**Copying into a new project:** fill §2's table and boundaries with the real
kernels, stages and browser steps; build §4's risk table with the real
failure modes of the algorithm; fill §5's ownership table once real modules
exist; pick §6's four static-analysis tools and §11's mutation scope; record
§9's default locator strategy; write §7's fixture generator and its
tolerances; measure §12 and §14's thresholds — never carry another project's
numbers. The instantiation goes in the project's own docs (architecture,
design decisions, CI config, pre-merge checklist), never into a copy of this
file.

**Update it when:** a server-side surface appears (invalidates §0); a new
input channel appears (a camera stream, a shared link, a file from another
app); a §5 verdict changes (record the reasoning); a gate moves (a changed
number is a changed justification); a kernel moves to WASM or the GPU (the
unit layer for that kernel changes shape); a named gap closes (delete it); or
an incident happens — add it to the risk model and name the level that should
have caught it.
