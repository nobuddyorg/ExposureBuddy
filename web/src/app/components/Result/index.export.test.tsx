// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installCanvasStubs, type CanvasStubs } from './canvas.test-support';
import { renderResult } from './result.test-support';

let stubs: CanvasStubs;

beforeEach(() => {
  localStorage.clear();
  stubs = installCanvasStubs();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:result',
    revokeObjectURL: () => {},
  });
});

afterEach(() => {
  stubs.restore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Web Share support as jsdom lacks it: both methods defined on the navigator for one test. */
function stubWebShare(share: (data: ShareData) => Promise<void>) {
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
}

describe('Result: save', () => {
  it('clicks a download anchor with a dated JPEG name and confirms it', async () => {
    const user = userEvent.setup();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    renderResult();
    await user.click(screen.getByRole('button', { name: 'Save image' }));
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0].download).toMatch(
      /^exposurebuddy-\d{4}-\d{2}-\d{2}-\d{4}\.jpg$/,
    );
    expect(stubs.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.92,
    );
    expect(screen.getByTestId('export-status')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.getByTestId('export-status')).toHaveTextContent(
      `Saved as ${clicked[0].download}`,
    );
  });
});

describe('Result: save', () => {
  it('reports a canvas the browser could not encode', async () => {
    const user = userEvent.setup();
    stubs.toBlob.mockImplementation((callback: BlobCallback) => callback(null));
    renderResult();
    await user.click(screen.getByTestId('download'));
    await waitFor(() =>
      expect(screen.getByTestId('export-status')).toHaveTextContent(
        'Something went wrong: The canvas could not be encoded as JPEG.',
      ),
    );
  });
});

describe('Result: share', () => {
  it('hides the share button where the browser cannot share files', () => {
    renderResult();
    expect(screen.queryByTestId('share')).toBeNull();
    expect(screen.getByTestId('download').className).toContain('bg-accent');
  });

  it('shares the JPEG with the screen title when the browser can', async () => {
    const user = userEvent.setup();
    const share = vi.fn(async () => {});
    const restore = stubWebShare(share);
    try {
      renderResult();
      await user.click(await screen.findByRole('button', { name: 'Share' }));
      await waitFor(() => expect(share).toHaveBeenCalledOnce());
      const [data] = share.mock.calls[0] as unknown as [ShareData];
      expect(data.title).toBe('Your long exposure');
      expect(data.files?.[0].type).toBe('image/jpeg');
      expect(screen.getByTestId('export-status')).toHaveTextContent('');
    } finally {
      restore();
    }
  });

  it('saves instead and says so when sharing fails', async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const restore = stubWebShare(() => Promise.reject(new Error('no app')));
    try {
      renderResult();
      await user.click(await screen.findByTestId('share'));
      await waitFor(() =>
        expect(screen.getByTestId('export-status')).toHaveTextContent(
          'Sharing did not work, so the image was saved instead.',
        ),
      );
      expect(click).toHaveBeenCalledOnce();
    } finally {
      restore();
    }
  });

  it('says nothing when the visitor dismissed the share sheet', async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const share = vi.fn(() =>
      Promise.reject(new DOMException('dismissed', 'AbortError')),
    );
    const restore = stubWebShare(share);
    try {
      renderResult();
      await user.click(await screen.findByTestId('share'));
      await waitFor(() => expect(share).toHaveBeenCalledOnce());
      expect(click).not.toHaveBeenCalled();
      expect(screen.getByTestId('export-status')).toHaveTextContent('');
    } finally {
      restore();
    }
  });
});
