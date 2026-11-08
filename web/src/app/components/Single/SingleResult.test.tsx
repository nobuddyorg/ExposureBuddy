// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SingleResult as Result } from '../../exposure/runSingle';
import { I18nProvider } from '../../i18n/I18nProvider';
import { DEFAULT_EFFECT_PARAMS } from '../../vision/effects/effectParams';
import {
  installCanvasStubs,
  rgbaImage,
  type CanvasStubs,
} from '../Result/canvas.test-support';
import SingleResult from './SingleResult';

let stubs: CanvasStubs;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
  stubs = installCanvasStubs();
});

afterEach(() => stubs.restore());

function renderSingle(overrides: Partial<Result> = {}) {
  const renderEffect = vi.fn<Result['render']>(async () =>
    rgbaImage(4, 3, 100),
  );
  const renderOriginal = vi.fn<Result['renderReference']>(async () =>
    rgbaImage(4, 3, 200),
  );
  const result: Result = {
    width: 4,
    height: 3,
    render: renderEffect,
    renderReference: renderOriginal,
    dispose: vi.fn(),
    ...overrides,
  };
  const onStartOver = vi.fn();
  render(
    <I18nProvider>
      <SingleResult
        result={result}
        onStartOver={onStartOver}
        shotDate={{ kind: 'undated' }}
      />
    </I18nProvider>,
  );
  return { renderEffect, renderOriginal, onStartOver };
}

describe('SingleResult', () => {
  it('renders the default effect and draws it at the photo size', async () => {
    const { renderEffect } = renderSingle();
    expect(renderEffect).toHaveBeenCalledExactlyOnceWith(DEFAULT_EFFECT_PARAMS);
    await waitFor(() => expect(stubs.context.putImageData).toHaveBeenCalled());
    const canvas = screen.getByTestId('result-canvas');
    expect(canvas).toHaveAccessibleName(
      'Photo with the people turned into ghosts',
    );
    expect(canvas).toHaveAttribute('width', '4');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Your ghosted photo',
    );
    expect(screen.getByTestId('result-stats')).toHaveTextContent('4 × 3 px');
  });

  it('shows the strength as a percentage and re-renders when it moves', async () => {
    const { renderEffect } = renderSingle();
    const slider = screen.getByTestId('strength-slider');
    expect(slider).toHaveValue('50');
    fireEvent.change(slider, { target: { value: '80' } });
    await waitFor(() =>
      expect(renderEffect).toHaveBeenLastCalledWith({
        ...DEFAULT_EFFECT_PARAMS,
        strength: 0.8,
      }),
    );
  });

  it('offers a direction for motion blur and smear only', async () => {
    const { renderEffect } = renderSingle();
    expect(screen.getByTestId('angle-slider')).toBeVisible();
    fireEvent.change(screen.getByTestId('angle-slider'), {
      target: { value: '90' },
    });
    await waitFor(() =>
      expect(renderEffect).toHaveBeenLastCalledWith({
        ...DEFAULT_EFFECT_PARAMS,
        angle: 90,
      }),
    );
    await userEvent.selectOptions(screen.getByTestId('effect-select'), 'smear');
    expect(screen.getByTestId('angle-slider')).toBeVisible();
    await userEvent.selectOptions(
      screen.getByTestId('effect-select'),
      'liquid',
    );
    expect(screen.queryByTestId('angle-slider')).toBeNull();
    await userEvent.selectOptions(screen.getByTestId('effect-select'), 'smoke');
    expect(screen.queryByTestId('angle-slider')).toBeNull();
    await waitFor(() =>
      expect(renderEffect).toHaveBeenLastCalledWith({
        ...DEFAULT_EFFECT_PARAMS,
        effect: 'smoke',
        angle: 90,
      }),
    );
  });

  it('shows the original photo while comparing, and disables the controls and the export', async () => {
    const { renderOriginal } = renderSingle();
    await waitFor(() =>
      expect(stubs.context.putImageData).toHaveBeenCalledTimes(1),
    );
    await userEvent.click(screen.getByTestId('compare-toggle'));
    await waitFor(() => expect(renderOriginal).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(stubs.context.putImageData).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByTestId('result-canvas')).toHaveAccessibleName(
      'One of the original photos',
    );
    expect(screen.getByTestId('strength-slider')).toBeDisabled();
    expect(screen.getByTestId('effect-select')).toBeDisabled();
    expect(screen.getByTestId('download')).toBeDisabled();
  });

  it('saves the picture and says so', async () => {
    renderSingle();
    await waitFor(() => expect(stubs.context.putImageData).toHaveBeenCalled());
    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    await userEvent.click(screen.getByTestId('download'));
    await waitFor(() =>
      expect(screen.getByTestId('export-status')).toHaveTextContent(/Saved as/),
    );
    vi.unstubAllGlobals();
  });

  it('goes back to the picker on start over', async () => {
    const { onStartOver } = renderSingle();
    await userEvent.click(screen.getByTestId('start-over'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('says why a render failed', async () => {
    renderSingle({
      render: vi.fn(async () => {
        throw new Error('out of memory');
      }),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('out of memory');
  });

  it('shows the original while the picture is held, and the effect again on release', async () => {
    renderSingle();
    await waitFor(() =>
      expect(stubs.context.putImageData).toHaveBeenCalledTimes(1),
    );
    const canvas = screen.getByTestId('result-canvas');
    fireEvent.pointerDown(canvas);
    await waitFor(() =>
      expect(canvas).toHaveAccessibleName('One of the original photos'),
    );
    fireEvent.pointerUp(canvas);
    await waitFor(() =>
      expect(canvas).toHaveAccessibleName(
        'Photo with the people turned into ghosts',
      ),
    );
    fireEvent.pointerDown(canvas);
    fireEvent.pointerCancel(canvas);
    fireEvent.pointerDown(canvas);
    fireEvent.pointerLeave(canvas);
    fireEvent.contextMenu(canvas);
    await waitFor(() =>
      expect(canvas).toHaveAccessibleName(
        'Photo with the people turned into ghosts',
      ),
    );
  });

  describe('where the browser can share files', () => {
    const stubShare = (share: (data: ShareData) => Promise<void>) => {
      Object.defineProperty(navigator, 'canShare', {
        value: () => true,
        configurable: true,
      });
      Object.defineProperty(navigator, 'share', {
        value: share,
        configurable: true,
      });
      return () => {
        delete (navigator as { canShare?: unknown }).canShare;
        delete (navigator as { share?: unknown }).share;
      };
    };

    it('shares the JPEG with the screen title', async () => {
      const share = vi.fn(async () => {});
      const restore = stubShare(share);
      try {
        renderSingle();
        await userEvent.click(await screen.findByTestId('share'));
        await waitFor(() => expect(share).toHaveBeenCalledOnce());
        const [data] = share.mock.calls[0] as unknown as [ShareData];
        expect(data.title).toBe('Your ghosted photo');
        expect(data.files?.[0].type).toBe('image/jpeg');
      } finally {
        restore();
      }
    });

    it('saves instead, and says so, when sharing fails', async () => {
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        () => {},
      );
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: () => 'blob:x',
        revokeObjectURL: () => {},
      });
      const restore = stubShare(() => Promise.reject(new Error('no app')));
      try {
        renderSingle();
        await userEvent.click(await screen.findByTestId('share'));
        await waitFor(() =>
          expect(screen.getByTestId('export-status')).toHaveTextContent(
            'Sharing did not work, so the image was saved instead.',
          ),
        );
      } finally {
        restore();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });
  });

  it('says why the picture could not be saved', async () => {
    renderSingle();
    await waitFor(() => expect(stubs.context.putImageData).toHaveBeenCalled());
    stubs.toBlob.mockImplementation((callback: BlobCallback) => callback(null));
    await userEvent.click(screen.getByTestId('download'));
    await waitFor(() =>
      expect(screen.getByTestId('export-status')).toHaveTextContent(
        'Something went wrong',
      ),
    );
  });
});
