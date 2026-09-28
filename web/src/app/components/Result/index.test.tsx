// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_COMPOSITE_PARAMS } from '../../vision/stack/composite';
import type { RgbaImage } from '../../vision/types';
import {
  deferred,
  installCanvasStubs,
  rgbaImage,
  type CanvasStubs,
} from './canvas.test-support';
import { fakeResult, renderResult } from './result.test-support';

let stubs: CanvasStubs;

beforeEach(() => {
  localStorage.clear();
  stubs = installCanvasStubs();
});

afterEach(() => {
  stubs.restore();
});

const drawnImages = () =>
  stubs.context.putImageData.mock.calls.map(([drawn]) => drawn as ImageData);

describe('Result: mounting', () => {
  it('renders the defaults and draws the composite at the result size', async () => {
    const composite = rgbaImage(4, 3, 100);
    const render = vi.fn(async () => composite);
    renderResult(fakeResult({ render }));
    expect(render).toHaveBeenCalledExactlyOnceWith(DEFAULT_COMPOSITE_PARAMS);
    await waitFor(() => expect(stubs.context.putImageData).toHaveBeenCalled());
    const [drawn] = drawnImages();
    expect([drawn.width, drawn.height]).toEqual([4, 3]);
    expect(drawn.data).toBe(composite.data);
    const canvas = screen.getByTestId('result-canvas');
    expect(canvas).toHaveAttribute('width', '4');
    expect(canvas).toHaveAttribute('height', '3');
    expect(canvas).toHaveAttribute('role', 'img');
    expect(canvas).toHaveAccessibleName('Combined long-exposure image');
  });

  it('shows the stats line with aligned, total and the size', () => {
    renderResult();
    expect(screen.getByTestId('result-stats')).toHaveTextContent(
      '5 of 6 photos aligned · 4 × 3 px',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Your long exposure',
    );
  });

  it('starts over through the callback', async () => {
    const user = userEvent.setup();
    const { onStartOver } = renderResult();
    await user.click(screen.getByTestId('start-over'));
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it('surfaces a render that failed', async () => {
    renderResult(
      fakeResult({ render: vi.fn(() => Promise.reject(new Error('lost'))) }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong: lost',
      ),
    );
  });
});

describe('Result: sliders', () => {
  it('shows the default values with their units', () => {
    renderResult();
    expect(screen.getByTestId('ghost-slider')).toHaveValue('60');
    expect(screen.getByTestId('blur-slider')).toHaveValue('4');
    expect(screen.getByTestId('glow-slider')).toHaveValue('25');
    expect(
      screen.getByRole('slider', { name: 'Ghosts' }),
    ).toHaveAccessibleDescription('How visible moving things stay');
    expect(screen.getByRole('slider', { name: 'Blur' })).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Glow' })).toBeVisible();
  });

  it('re-renders with the mapped params after a move and shows the value', async () => {
    const render = vi.fn(async () => rgbaImage(4, 3));
    renderResult(fakeResult({ render }));
    fireEvent.change(screen.getByTestId('ghost-slider'), {
      target: { value: '30' },
    });
    expect(screen.getByTestId('ghost-slider')).toHaveValue('30');
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('30 %');
    await waitFor(() =>
      expect(render).toHaveBeenLastCalledWith({
        ghostStrength: 0.3,
        ghostBlur: 4,
        glow: 0.25,
      }),
    );
    fireEvent.change(screen.getByTestId('blur-slider'), {
      target: { value: '16' },
    });
    fireEvent.change(screen.getByTestId('glow-slider'), {
      target: { value: '80' },
    });
    await waitFor(() =>
      expect(render).toHaveBeenLastCalledWith({
        ghostStrength: 0.3,
        ghostBlur: 16,
        glow: 0.8,
      }),
    );
    expect(render).toHaveBeenCalledTimes(3);
  });
});

describe('Result: compare', () => {
  it('toggles to the single photo and back, disabling the sliders meanwhile', async () => {
    const user = userEvent.setup();
    const composite = rgbaImage(4, 3, 100);
    const reference = rgbaImage(4, 3, 200);
    const render = vi.fn(async () => composite);
    const renderReference = vi.fn(async () => reference);
    renderResult(fakeResult({ render, renderReference }));
    await waitFor(() => expect(stubs.context.putImageData).toHaveBeenCalled());
    const toggle = screen.getByTestId('compare-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAccessibleName('Compare with one photo');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ghost-slider')).toBeDisabled();
    expect(screen.getByTestId('blur-slider')).toBeDisabled();
    expect(screen.getByTestId('glow-slider')).toBeDisabled();
    await waitFor(() =>
      expect(drawnImages().at(-1)?.data).toBe(reference.data),
    );
    expect(screen.getByTestId('result-canvas')).toHaveAccessibleName(
      'One of the original photos',
    );

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('ghost-slider')).toBeEnabled();
    await waitFor(() =>
      expect(drawnImages().at(-1)?.data).toBe(composite.data),
    );
    expect(screen.getByTestId('result-canvas')).toHaveAccessibleName(
      'Combined long-exposure image',
    );
    expect(renderReference).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it('keeps the composite on screen until the reference arrives', async () => {
    const user = userEvent.setup();
    const pending = deferred<RgbaImage>();
    renderResult(fakeResult({ renderReference: () => pending.promise }));
    await waitFor(() => expect(stubs.context.putImageData).toHaveBeenCalled());
    await user.click(screen.getByTestId('compare-toggle'));
    expect(stubs.context.putImageData).toHaveBeenCalledOnce();
    expect(screen.getByTestId('result-canvas')).toHaveAccessibleName(
      'Combined long-exposure image',
    );
  });
});
