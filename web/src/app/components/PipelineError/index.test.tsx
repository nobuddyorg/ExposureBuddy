// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PipelineFailure } from '../../exposure/failure';
import { I18nProvider } from '../../i18n/I18nProvider';
import PipelineError from './index';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
});

function renderError(failure: PipelineFailure) {
  const onRetry = vi.fn();
  render(
    <I18nProvider>
      <PipelineError failure={failure} onRetry={onRetry} />
    </I18nProvider>,
  );
  return { onRetry };
}

describe('PipelineError', () => {
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
