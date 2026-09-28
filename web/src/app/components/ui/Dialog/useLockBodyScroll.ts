'use client';

import { useEffect } from 'react';

/** While `active`, stops the page behind a dialog from scrolling; restores the previous overflow after. */
export function useLockBodyScroll(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, [active]);
}
