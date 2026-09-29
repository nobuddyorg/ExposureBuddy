import type { CompositeParams } from '../types';

/** The look a result opens with; the sliders start here. */
export const DEFAULT_COMPOSITE_PARAMS: CompositeParams = {
  ghostStrength: 0.6,
  ghostBlur: 4,
  glow: 0.25,
};

const MAX_GHOST_BLUR = 32;

/** Returns `params` with strength and glow clamped to [0, 1], blur to [0, 32]; a NaN falls back to its default. */
export function clampCompositeParams(params: CompositeParams): CompositeParams {
  return {
    ghostStrength: clampOrDefault(
      params.ghostStrength,
      1,
      DEFAULT_COMPOSITE_PARAMS.ghostStrength,
    ),
    // Whole pixels: the box blur indexes its buffers by the radius.
    ghostBlur: Math.round(
      clampOrDefault(
        params.ghostBlur,
        MAX_GHOST_BLUR,
        DEFAULT_COMPOSITE_PARAMS.ghostBlur,
      ),
    ),
    glow: clampOrDefault(params.glow, 1, DEFAULT_COMPOSITE_PARAMS.glow),
  };
}

function clampOrDefault(value: number, max: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(0, value));
}
