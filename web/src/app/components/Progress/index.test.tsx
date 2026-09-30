// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PipelineProgress } from '../../exposure/runPipeline';
import { I18nProvider } from '../../i18n/I18nProvider';
import type { FrameReport } from '../../vision/types';
import Progress from './index';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
});

const FRAMES: FrameReport[] = [
  { index: 0, status: 'aligned', matches: 200, inliers: 120 },
  { index: 1, status: 'reference', matches: 0, inliers: 0 },
  { index: 2, status: 'skipped', matches: 30, inliers: 3 },
  { index: 3, status: 'unreadable', matches: 0, inliers: 0 },
  { index: 4, status: 'pending', matches: 0, inliers: 0 },
];

function renderProgress(overrides: Partial<PipelineProgress> = {}) {
  const progress: PipelineProgress = {
    stage: 'aligning',
    done: 2,
    total: 4,
    frames: FRAMES,
    ...overrides,
  };
  const onCancel = vi.fn();
  render(
    <I18nProvider>
      <Progress progress={progress} onCancel={onCancel} />
    </I18nProvider>,
  );
  return { onCancel };
}

describe('Progress', () => {
  it('names the screen and the stage, with the count', () => {
    renderProgress();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Combining' }),
    ).toBeVisible();
    expect(screen.getByTestId('progress-stage')).toHaveTextContent(
      'Aligning photos',
    );
    expect(screen.getByText('2 of 4')).toBeVisible();
    expect(screen.getByTestId('progress')).toBeVisible();
  });

  it.each([
    ['reference', 'Finding features in the reference photo'],
    ['stacking', 'Stacking'],
    ['compositing', 'Rendering'],
  ] as const)('labels the %s stage', (stage, label) => {
    renderProgress({ stage });
    expect(screen.getByTestId('progress-stage')).toHaveTextContent(label);
  });

  it('announces the stage line politely', () => {
    renderProgress();
    expect(
      screen.getByTestId('progress-stage').parentElement?.parentElement,
    ).toHaveAttribute('aria-live', 'polite');
  });

  it('exposes done and total on the bar', () => {
    renderProgress({ stage: 'stacking', done: 37, total: 100 });
    const bar = screen.getByRole('progressbar', { name: 'Stacking' });
    expect(bar).toHaveAttribute('data-testid', 'progress-bar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuenow', '37');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '37 of 100');
    expect(bar.firstElementChild).toHaveStyle({ width: '37%' });
  });

  it('shows one chip per frame, reflecting each status', () => {
    renderProgress();
    const chips = screen.getAllByTestId('frame-status');
    expect(chips).toHaveLength(5);
    expect(chips[0]).toHaveTextContent('1');
    expect(chips[0]).toHaveTextContent('aligned');
    expect(chips[0]).toHaveAttribute('data-status', 'aligned');
    expect(chips[1]).toHaveTextContent('2');
    expect(chips[1]).toHaveTextContent('reference');
    expect(chips[2]).toHaveTextContent('skipped');
    expect(chips[3]).toHaveTextContent('could not be read');
    expect(chips[4]).toHaveTextContent('waiting');
  });

  it('carries the match detail on aligned and skipped chips only', () => {
    renderProgress();
    const chips = screen.getAllByTestId('frame-status');
    expect(chips[0]).toHaveAttribute('title', '120 of 200 matches');
    expect(chips[0]).toHaveTextContent('120 of 200 matches');
    expect(chips[2]).toHaveAttribute('title', '3 of 30 matches');
    expect(chips[1]).not.toHaveAttribute('title');
    expect(chips[3]).not.toHaveAttribute('title');
    expect(chips[4]).not.toHaveAttribute('title');
  });

  it('shows no chip list before the frames are known', () => {
    renderProgress({ stage: 'reference', done: 0, total: 1, frames: [] });
    expect(screen.queryByTestId('frame-status')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('cancels from its button', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderProgress();
    await user.click(screen.getByTestId('cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  it('speaks German when the language is German', () => {
    localStorage.setItem('lang', 'de');
    renderProgress();
    expect(screen.getByTestId('progress-stage')).toHaveTextContent(
      'Fotos ausrichten',
    );
    expect(screen.getByText('2 von 4')).toBeVisible();
  });
});
