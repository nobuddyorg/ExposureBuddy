// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PipelineFailure } from '../../exposure/failure';
import { I18nProvider } from '../../i18n/I18nProvider';
import PipelineError from './index';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const REPORT = 'ExposureBuddy dev\nFailure: cancelled';

function renderError(failure: PipelineFailure) {
  const onRetry = vi.fn();
  render(
    <I18nProvider>
      <PipelineError failure={failure} onRetry={onRetry} diagnostics={REPORT} />
    </I18nProvider>,
  );
  return { onRetry };
}

describe('PipelineError', () => {
  it('shows the diagnostic report folded away, with what it holds and what it leaves out', async () => {
    const user = userEvent.setup();
    renderError({ kind: 'cancelled' });
    const text = screen.getByTestId('diagnostics-text');
    expect(text).not.toBeVisible();
    await user.click(screen.getByText('Diagnostic info'));
    expect(text).toBeVisible();
    expect(text.textContent).toBe(REPORT);
    expect(text).toHaveAccessibleDescription(
      'If this keeps happening, these details help to fix it. They hold no photo and no file name.',
    );
  });

  it('copies the report and says so', async () => {
    const user = userEvent.setup();
    // user-event puts a clipboard of its own on navigator; the spy watches it.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderError({ kind: 'cancelled' });
    expect(screen.getByRole('status')).toHaveTextContent('');
    await user.click(
      screen.getByRole('button', { name: 'Copy diagnostic info' }),
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(REPORT);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Copied. Paste it into a bug report.',
    );
  });

  it('says where to find the text when the clipboard refuses', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied'),
    );
    renderError({ kind: 'cancelled' });
    await user.click(screen.getByTestId('copy-diagnostics'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Could not copy. Open Diagnostic info and copy the text by hand.',
    );
  });

  it('is an alert with the title and a retry button', () => {
    renderError({ kind: 'cancelled' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-testid', 'pipeline-error');
    expect(
      screen.getByRole('heading', { level: 1, name: 'That did not work' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAttribute(
      'data-testid',
      'retry',
    );
  });

  it.each<[PipelineFailure, string]>([
    [{ kind: 'too_few_aligned', count: 1 }, 'Only 1 photo lined up'],
    [
      { kind: 'decode_failed', name: 'IMG_0001.HEIC' },
      'IMG_0001.HEIC could not be read.',
    ],
    [{ kind: 'cancelled' }, 'Cancelled.'],
    [
      { kind: 'unknown', message: 'worker died' },
      'Something went wrong: worker died',
    ],
    [{ kind: 'unsupported' }, 'This browser cannot run the pipeline'],
  ])('explains %o', (failure, text) => {
    renderError(failure);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
  });

  it('retries from its button', async () => {
    const user = userEvent.setup();
    const { onRetry } = renderError({ kind: 'cancelled' });
    await user.click(screen.getByTestId('retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('speaks German when the language is German', () => {
    localStorage.setItem('lang', 'de');
    renderError({ kind: 'too_few_aligned', count: 1 });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nur 1 Foto ließ sich auf die anderen ausrichten',
    );
    expect(screen.getByRole('button', { name: 'Noch einmal' })).toBeVisible();
  });
});
