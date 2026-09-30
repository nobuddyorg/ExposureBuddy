import { render } from '@testing-library/react';
import { vi } from 'vitest';

import type { ExposureResult } from '../../exposure/runPipeline';
import { I18nProvider } from '../../i18n/I18nProvider';
import { rgbaImage } from './canvas.test-support';
import Result from './index';

const RESULT_SIZE = { width: 4, height: 3 };

/** A finished stack whose renders answer at once with a distinct image each; override to control timing. */
export function fakeResult(
  overrides: Partial<ExposureResult> = {},
): ExposureResult {
  return {
    ...RESULT_SIZE,
    frames: [],
    alignedCount: 5,
    totalCount: 6,
    render: vi.fn(async () => rgbaImage(4, 3, 100)),
    renderReference: vi.fn(async () => rgbaImage(4, 3, 200)),
    dispose: vi.fn(),
    ...overrides,
  };
}

export function renderResult(
  result: ExposureResult = fakeResult(),
  onStartOver = vi.fn(),
) {
  localStorage.setItem('lang', 'en');
  const view = render(
    <I18nProvider>
      <Result
        result={result}
        totalCount={6}
        onStartOver={onStartOver}
        shotDate={{ kind: 'undated' }}
      />
    </I18nProvider>,
  );
  return { ...view, result, onStartOver };
}
