'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExposureResult } from '../../exposure/runPipeline';
import type { RgbaImage } from '../../vision/types';

// A touch that turns into a scroll cancels within this time, so a swipe over the image never flashes the photo.
const HOLD_DELAY_MS = 150;

export interface CompareController {
  /** The toggle is on or the image is being held. */
  readonly comparing: boolean;
  /** Only the toggle: what the button reports as pressed. */
  readonly toggled: boolean;
  /** One original photo at the result's crop; null until it was fetched, which the first toggle starts. */
  readonly reference: RgbaImage | null;
  toggle: () => void;
  /** Press and hold on the image shows the photo; letting go, or a scroll taking over the touch, hides it. */
  hold: (holding: boolean) => void;
}

/** The compare toggle: fetches `result.renderReference()` once, on the first press, and keeps it. */
export function useCompare(result: ExposureResult): CompareController {
  const [toggled, setToggled] = useState(false);
  const [holding, setHolding] = useState(false);
  const comparing = toggled || holding;
  const [reference, setReference] = useState<RgbaImage | null>(null);
  const requested = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(holdTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!comparing || requested.current) return;
    requested.current = true;
    result.renderReference().then(
      (image) => {
        if (mounted.current) setReference(image);
      },
      () => {
        // A failed fetch may be retried on the next press; the composite stays on screen meanwhile.
        requested.current = false;
      },
    );
  }, [comparing, result]);

  const toggle = useCallback(() => setToggled((value) => !value), []);
  const hold = useCallback((value: boolean) => {
    clearTimeout(holdTimer.current);
    if (value)
      holdTimer.current = setTimeout(() => setHolding(true), HOLD_DELAY_MS);
    else setHolding(false);
  }, []);

  return { comparing, toggled, reference, toggle, hold };
}
