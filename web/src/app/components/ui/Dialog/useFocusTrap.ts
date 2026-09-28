'use client';

import { useEffect, type RefObject } from 'react';

import { getFocusable } from './getFocusable';

function restoreFocus(previous: HTMLElement | null) {
  // Something else already took focus; only a lost focus is restored.
  if (document.activeElement !== document.body) return;
  // The opener may have left the DOM while the dialog was open, making focus() a silent no-op.
  if (previous?.isConnected) previous.focus();
  else document.getElementById('main-content')?.focus();
}

/** While `open`, keeps Tab inside `containerRef`, starts on its first control and returns focus on close. */
export function useFocusTrap(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    getFocusable(containerRef.current)[0]?.focus();
    // Deferred: this cleanup runs before Dialog lifts the inert that makes focus() a no-op.
    return () => queueMicrotask(() => restoreFocus(previous));
  }, [open, containerRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(containerRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, containerRef]);
}
