// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLeaveWarning } from './useLeaveWarning';

/** Fires beforeunload as a navigation would; true when a listener asked the browser to confirm. */
function leave(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('useLeaveWarning', () => {
  it('asks to confirm leaving while active', () => {
    renderHook(() => useLeaveWarning(true));
    expect(leave()).toBe(true);
  });

  it('lets the page go while inactive', () => {
    renderHook(() => useLeaveWarning(false));
    expect(leave()).toBe(false);
  });

  it('removes the listener once no longer active', () => {
    const { rerender } = renderHook(({ active }) => useLeaveWarning(active), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    expect(leave()).toBe(false);
  });

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useLeaveWarning(true));
    unmount();
    expect(leave()).toBe(false);
  });
});
