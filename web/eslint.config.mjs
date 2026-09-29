import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import sonarjs from 'eslint-plugin-sonarjs';

const REACT_VERSION = '19.3.0';

const eslintConfig = [
  // Generated output and interrupted-run leftovers.
  {
    ignores: [
      'coverage/**',
      'coverage-e2e/**',
      '.stryker-tmp/**',
      'reports/**',
      'out/**',
      '.next/**',
      '.e2e-serve/**',
      'test-results/**',
      'playwright-report/**',
      'e2e/fixtures/generated/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // eslint-plugin-react's version auto-detection calls context.getFilename(), which ESLint 10 removed.
  {
    settings: { react: { version: REACT_VERSION } },
  },
  // Type-aware linting for src/ only: e2e/ would need a second tsconfig.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}'],
  })),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // A mock standing in for an async API rarely needs to await anything.
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/*.test-support.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  // core-web-vitals already registers jsx-a11y; redeclaring `plugins` errors, so only rules go here.
  {
    files: ['src/app/**/*.tsx'],
    ignores: ['src/app/**/*.test.tsx', 'src/app/**/*.test-support.tsx'],
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
    },
  },
  // Code-smell analysis for non-test source: a test's job is to be exhaustive, not non-repetitive.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/**/*.test-support.{ts,tsx}'],
    ...sonarjs.configs.recommended,
    // The recommended config sets a placeholder settings.react; a later `settings` replaces an earlier one wholesale.
    settings: { react: { version: REACT_VERSION } },
    rules: {
      ...sonarjs.configs.recommended.rules,
      // Fires on every repeated Tailwind className string, not on duplicated logic.
      'sonarjs/no-duplicate-string': 'off',
      // Flags `void promise`, the very fix @typescript-eslint/no-floating-promises asks for.
      'sonarjs/void-use': 'off',
      // Would wrap every props type in `Readonly<...>`, a house style adopted nowhere here.
      'sonarjs/prefer-read-only-props': 'off',
      // 20: cognitive complexity is reviewed, not gamed; image kernels are dense by nature.
      'sonarjs/cognitive-complexity': ['warn', 20],
    },
  },
  // The vision layer is framework-free: pure TypeScript over typed arrays, runnable in a worker or in Node.
  {
    files: ['src/app/vision/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'next',
                'next/*',
                '**/components/**',
                '**/i18n/**',
              ],
              message:
                'src/app/vision/ is pure logic: no React, no Next, no UI. Put glue in src/app/components/ or the hooks beside them.',
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
