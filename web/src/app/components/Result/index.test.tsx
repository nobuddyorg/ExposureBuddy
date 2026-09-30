// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultCompositeParams } from '../../vision/stack/compositeParams';
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

// fakeResult: 5 aligned frames, 4 × 3 px.
const FAKE_RESULT_DEFAULTS = defaultCompositeParams({
  frameCount: 5,
  longEdge: 4,
});

const drawnImages = () =>
  stubs.context.putImageData.mock.calls.map(([drawn]) => drawn as ImageData);

describe('Result: mounting', () => {
  it('renders the defaults and draws the composite at the result size', async () => {
    const composite = rgbaImage(4, 3, 100);
    const render = vi.fn(async () => composite);
    renderResult(fakeResult({ render }));
    expect(render).toHaveBeenCalledExactlyOnceWith(FAKE_RESULT_DEFAULTS);
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

  it('names the photos that were left out, and says nothing when none were', () => {
    renderResult(fakeResult({ alignedCount: 5 }));
    expect(screen.getByTestId('result-skipped')).toHaveTextContent(
      '1 photo did not line up with the others and was left out.',
    );
  });

  it('shows no skipped notice when every photo lined up', () => {
    renderResult(fakeResult({ alignedCount: 6 }));
    expect(screen.queryByTestId('result-skipped')).toBeNull();
  });

  it('puts the compare hint under the image', () => {
    renderResult();
    expect(screen.getByRole('figure')).toContainElement(
      screen.getByText('Press and hold the image to compare it with one photo'),
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
  it('shows the defaults for the frame count with their units', () => {
    renderResult();
    // Five frames of 4 × 3 px: fainter ghosts than a settled burst and no blur worth a pixel.
    expect(screen.getByTestId('ghost-slider')).toHaveValue('30');
    expect(screen.getByTestId('blur-slider')).toHaveValue('0');
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
      target: { value: '40' },
    });
    expect(screen.getByTestId('ghost-slider')).toHaveValue('40');
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('40 %');
    await waitFor(() =>
      expect(render).toHaveBeenLastCalledWith({
        ghostStrength: 0.4,
        ghostBlur: 0,
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
        ghostStrength: 0.4,
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
    // The canvas shows the single photo now; saving it as the result would mislead.
    expect(screen.getByTestId('download')).toBeDisabled();
    await waitFor(() =>
      expect(drawnImages().at(-1)?.data).toBe(reference.data),
    );
    expect(screen.getByTestId('result-canvas')).toHaveAccessibleName(
      'One of the original photos',
    );

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('ghost-slider')).toBeEnabled();
    expect(screen.getByTestId('download')).toBeEnabled();
    await waitFor(() =>
      expect(drawnImages().at(-1)?.data).toBe(composite.data),
    );
    expect(screen.getByTestId('result-canvas')).toHaveAccessibleName(
      'Combined long-exposure image',
    );
    expect(renderReference).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it('shows the single photo while the image is pressed and the composite again on release', async () => {
    const composite = rgbaImage(4, 3, 100);
    const reference = rgbaImage(4, 3, 200);
    renderResult(
      fakeResult({
        render: async () => composite,
        renderReference: async () => reference,
      }),
    );
    await waitFor(() => expect(stubs.context.putImageData).toHaveBeenCalled());
    const canvas = screen.getByTestId('result-canvas');

    fireEvent.pointerDown(canvas);
    await waitFor(() =>
      expect(drawnImages().at(-1)?.data).toBe(reference.data),
    );
    expect(screen.getByTestId('compare-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.pointerUp(canvas);
    await waitFor(() =>
      expect(drawnImages().at(-1)?.data).toBe(composite.data),
    );
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
