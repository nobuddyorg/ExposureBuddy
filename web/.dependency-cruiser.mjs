// Walks the whole module graph, so it catches a component reaching into a layer through another module, which ESLint's per-file no-restricted-imports cannot.
const config = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle between modules makes both harder to reason about and to test in isolation.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment:
        'A module nothing imports and that imports nothing local is dead code -- ' +
        'CLAUDE.md rules that out explicitly. Test/spec files, workers (started by URL) and .d.ts files are ' +
        'expected to be "orphans" in graph terms (they are run, not imported).',
      from: {
        orphan: true,
        pathNot: [
          '\\.(test|spec)\\.(ts|tsx)$',
          '\\.worker\\.ts$',
          '\\.d\\.ts$',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        'An import dependency-cruiser cannot resolve is usually a typo or a missing dependency.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'vision-is-pure',
      severity: 'error',
      comment:
        'src/app/vision/ is the image pipeline: pure TypeScript over typed arrays that runs in a worker, ' +
        'in Node under Vitest, and under Stryker. It never reaches React, Next, the UI or translations.',
      from: { path: '^src/app/vision/' },
      to: {
        path: [
          '^node_modules/(react|react-dom|next)/',
          '^src/app/components/',
          '^src/app/i18n/',
        ],
      },
    },
    {
      name: 'workers-reach-only-vision',
      severity: 'error',
      comment:
        'A worker entry imports the vision layer and nothing else: no React, no DOM-only helpers, no UI.',
      from: { path: '\\.worker\\.ts$' },
      to: { path: '^src/app/', pathNot: '^src/app/vision/' },
    },
    {
      name: 'i18n-no-app-deps',
      severity: 'error',
      comment:
        'Translation lookup is a leaf: it must not depend on the pipeline or the UI.',
      from: { path: '^src/app/i18n/' },
      to: { path: '^src/app/(vision|components)/' },
    },
    {
      name: 'e2e-is-black-box',
      severity: 'error',
      comment:
        'e2e/ drives the app through a real browser and never imports app internals directly.',
      from: { path: '^e2e/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'scripts-are-standalone',
      severity: 'error',
      comment:
        'web/scripts/** are Node tools that run outside the Next.js build and must not depend on browser-only app code.',
      from: { path: '^scripts/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'app-bundle-no-node-tooling',
      severity: 'error',
      comment:
        'src/app/ is what ships in the static export, so it must never import from scripts/ or e2e/.',
      from: { path: '^src/app/' },
      to: { path: '^(scripts|e2e)/' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    // Type-only imports are erased at runtime but are real coupling; without this most sibling `types.ts` files misreport as orphans.
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    progress: { type: 'none' },
  },
};

export default config;
