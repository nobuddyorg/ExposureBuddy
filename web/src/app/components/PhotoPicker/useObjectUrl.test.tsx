// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useObjectUrl } from './useObjectUrl';

// jsdom has no object URLs; each call hands out a distinct fake so revocations can be matched to creations.
let created = 0;
const createObjectURL = vi.fn(() => {
  created += 1;
  return `blob:${created}`;
});
const revokeObjectURL = vi.fn();

beforeEach(() => {
  created = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL,
    revokeObjectURL,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

describe('useObjectUrl', () => {
  it('makes one URL for the file', () => {
    const { result } = renderHook(() => useObjectUrl(fileA));
    expect(result.current).toBe('blob:1');
    expect(createObjectURL).toHaveBeenCalledWith(fileA);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('revokes it on unmount', () => {
    const { unmount } = renderHook(() => useObjectUrl(fileA));
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
  });

  it('swaps the URL when the file changes and revokes the old one', () => {
    const { result, rerender } = renderHook(({ file }) => useObjectUrl(file), {
      initialProps: { file: fileA },
    });
    rerender({ file: fileB });
    expect(result.current).toBe('blob:2');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:2');
  });

  it('keeps the URL across a re-render with the same file', () => {
    const { result, rerender } = renderHook(({ file }) => useObjectUrl(file), {
      initialProps: { file: fileA },
    });
    rerender({ file: fileA });
    expect(result.current).toBe('blob:1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
