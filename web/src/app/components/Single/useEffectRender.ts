'use client';

import { useEffect, useRef, useState } from 'react';

import type { SingleResult } from '../../exposure/runSingle';
import {
  DEFAULT_EFFECT_PARAMS,
  type EffectParams,
} from '../../vision/effects/effectParams';
import type { RgbaImage } from '../../vision/types';
import { errorMessage } from '../Result/errorMessage';

export interface EffectRenderController {
  readonly params: EffectParams;
  /** The latest render the worker produced; null until the first one arrives. */
  readonly image: RgbaImage | null;
  /** The message of a render that failed, empty while every render succeeded. */
  readonly error: string;
  setParams: (params: EffectParams) => void;
}

const DEBOUNCE_MS = 80;

/** Renders `result` for the current params in its worker: the first at once, later ones debounced, newest wins. */
export function useEffectRender(result: SingleResult): EffectRenderController {
  const [params, setParams] = useState(DEFAULT_EFFECT_PARAMS);
  const [image, setImage] = useState<RgbaImage | null>(null);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const renderedOnce = useRef(false);

  useEffect(() => {
    sequence.current += 1;
    const id = sequence.current;
    // Only the newest request may draw: a slow earlier render resolving late is dropped.
    const isCurrent = () => id === sequence.current;
    const render = () =>
      result.render(params).then(
        (rendered) => {
          if (isCurrent()) setImage(rendered);
        },
        (cause: unknown) => {
          if (isCurrent()) setError(errorMessage(cause));
        },
      );
    if (!renderedOnce.current) {
      renderedOnce.current = true;
      void render();
      return;
    }
    const timer = setTimeout(() => void render(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [params, result]);

  // A result that unmounts with a render in flight must not set state afterwards.
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );

  return { params, image, error, setParams };
}
