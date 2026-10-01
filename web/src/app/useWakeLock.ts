'use client';

import { useEffect } from 'react';

/** Keeps the screen on while `active`, so a phone does not lock and throttle the workers mid-run. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    const held: WakeLockSentinel[] = [];
    let ended = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          if (ended) void sentinel.release();
          else held.push(sentinel);
        },
        (error: unknown) => {
          // Refused (battery saver, a denied permission): the run still works, the screen may just dim.
          console.warn('Screen wake lock refused:', error);
        },
      );
    };
    acquire();
    // The browser drops the lock whenever the page is hidden; coming back takes it again.
    document.addEventListener('visibilitychange', acquire);
    return () => {
      ended = true;
      document.removeEventListener('visibilitychange', acquire);
      held.forEach((sentinel) => void sentinel.release());
    };
  }, [active]);
}
