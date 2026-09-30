'use client';

import { useEffect } from 'react';

function warn(event: BeforeUnloadEvent): void {
  event.preventDefault();
}

/** Asks the browser to confirm leaving while `active`; the listener exists only then, as it keeps the page out of the back/forward cache. */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}
