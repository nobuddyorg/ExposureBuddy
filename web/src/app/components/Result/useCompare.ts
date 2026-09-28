'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExposureResult } from '../../exposure/runPipeline';
import type { RgbaImage } from '../../vision/types';

export interface CompareController {
  readonly comparing: boolean;
  /** One original photo at the result's crop; null until it was fetched, which the first toggle starts. */
  readonly reference: RgbaImage | null;
  toggle: () => void;
}

/** The compare toggle: fetches `result.renderReference()` once, on the first press, and keeps it. */
export function useCompare(result: ExposureResult): CompareController {
  const [comparing, setComparing] = useState(false);
  const [reference, setReference] = useState<RgbaImage | null>(null);
  const requested = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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

  const toggle = useCallback(() => setComparing((value) => !value), []);

  return { comparing, reference, toggle };
}
