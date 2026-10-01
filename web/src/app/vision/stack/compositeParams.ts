import { BACKGROUND_MODES, type CompositeParams } from '../types';

/** The look a burst of many frames opens with, and what an invalid value falls back to. */
export const DEFAULT_COMPOSITE_PARAMS: CompositeParams = {
  background: 'median',
  ghostStrength: 0.6,
  ghostBlur: 4,
  glow: 0.25,
  trails: false,
};

export const MAX_GHOST_BLUR = 128;

// From this many frames on a mover's copies overlap and the defaults above are as good as they get.
const SETTLED_FRAME_COUNT = 10;
const MIN_GHOST_STRENGTH = 0.25;
const GHOST_STRENGTH_PER_FRAME =
  DEFAULT_COMPOSITE_PARAMS.ghostStrength / SETTLED_FRAME_COUNT;
// Blur as a share of the long edge, so the same look comes out at any output size.
const BLUR_PER_LONG_EDGE = 0.0025;
const MAX_BLUR_BOOST = 3;

export interface DefaultParamsInput {
  /** How many frames the stack holds. */
  readonly frameCount: number;
  /** The longer side of the composite, in pixels. */
  readonly longEdge: number;
}

/** The look a result of `frameCount` frames opens with: fewer frames mean fainter, softer ghosts, since a mover shows as a few separate copies. */
export function defaultCompositeParams({
  frameCount,
  longEdge,
}: DefaultParamsInput): CompositeParams {
  const blurBoost = Math.min(
    MAX_BLUR_BOOST,
    Math.max(1, SETTLED_FRAME_COUNT / frameCount),
  );
  return clampCompositeParams({
    background: DEFAULT_COMPOSITE_PARAMS.background,
    ghostStrength: Math.min(
      DEFAULT_COMPOSITE_PARAMS.ghostStrength,
      Math.max(MIN_GHOST_STRENGTH, frameCount * GHOST_STRENGTH_PER_FRAME),
    ),
    ghostBlur: longEdge * BLUR_PER_LONG_EDGE * blurBoost,
    glow: DEFAULT_COMPOSITE_PARAMS.glow,
    trails: DEFAULT_COMPOSITE_PARAMS.trails,
  });
}

/** Returns `params` with strength and glow clamped to [0, 1], blur to [0, 32]; a NaN falls back to its default. */
export function clampCompositeParams(params: CompositeParams): CompositeParams {
  return {
    background: BACKGROUND_MODES.includes(params.background)
      ? params.background
      : DEFAULT_COMPOSITE_PARAMS.background,
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
    // Anything but true, a value from outside included, is ghosts.
    trails: params.trails === true,
  };
}

function clampOrDefault(value: number, max: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(0, value));
}
