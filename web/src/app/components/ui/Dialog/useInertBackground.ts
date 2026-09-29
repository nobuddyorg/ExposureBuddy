'use client';

import { useEffect } from 'react';

/** While `active`, marks `#app-root` inert so nothing behind the dialog is reachable by keyboard or screen reader. */
export function useInertBackground(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    // aria-modal alone is not honoured by VoiceOver or NVDA browse mode; inert on the root is.
    const root = document.getElementById('app-root');
    if (!root) return;
    root.inert = true;
    return () => {
      root.inert = false;
    };
  }, [active]);
}
