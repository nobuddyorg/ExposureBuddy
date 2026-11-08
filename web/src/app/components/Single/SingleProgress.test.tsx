// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SingleProgress as Progress } from '../../exposure/runSingle';
import { I18nProvider } from '../../i18n/I18nProvider';
import SingleProgress from './SingleProgress';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
});

function renderProgress(progress: Progress) {
  const onCancel = vi.fn();
  render(
    <I18nProvider>
      <SingleProgress progress={progress} onCancel={onCancel} />
    </I18nProvider>,
  );
  return onCancel;
}

describe('SingleProgress', () => {
  it('names the stage and shows the megabytes while the model downloads', () => {
    renderProgress({
      stage: 'model',
      done: 5 * 1024 * 1024,
      total: 17 * 1024 * 1024,
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Ghosting the people',
    );
    expect(screen.getByTestId('progress-stage')).toHaveTextContent(
      'Loading the detection model',
    );
    expect(screen.getByText('5 of 17 MB')).toBeVisible();
    const bar = screen.getByRole('progressbar', {
      name: 'Loading the detection model',
    });
    expect(bar).toHaveAttribute('aria-valuenow', '24');
    expect(bar).toHaveAttribute(
      'aria-valuetext',
      'Loading the detection model: 5 of 17 MB',
    );
  });

  it('has no count outside the download', () => {
    renderProgress({ stage: 'detect', done: 0, total: 1 });
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '70');
    expect(bar).toHaveAttribute('aria-valuetext', 'Finding people');
  });

  it('lets the visitor cancel', async () => {
    const onCancel = renderProgress({ stage: 'decode', done: 0, total: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
