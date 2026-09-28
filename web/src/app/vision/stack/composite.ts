import type { CompositeParams, Rect, RgbaImage, StackResult } from '../types';
import { boxBlurFloat } from './boxBlur';

export const DEFAULT_COMPOSITE_PARAMS: CompositeParams = {
  ghostStrength: 0.6,
  ghostBlur: 4,
  glow: 0.25,
};

const MAX_GHOST_BLUR = 32;
const GLOW_SCALE = 1.5;
const GLOW_BLUR_MARGIN = 6;
const BLUR_PASSES = 3;
const RGB = 3;
const RGBA = 4;
const OPAQUE = 255;

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

/** Returns the `rect`-sized composite `median + ghostStrength × blur(mean − median) + glow × 1.5 × blur(max(mean − median, 0))`, opaque; reads only pixels inside `rect`. */
export function composite(
  stack: StackResult,
  params: CompositeParams,
  rect: Rect,
): RgbaImage {
  const { width, height } = rect;
  const pixelCount = width * height;
  const median = cropChannels(stack.median, stack.width, rect);
  const ghost = new Float32Array(pixelCount * RGB);
  const glowSource = new Float32Array(pixelCount * RGB);
  for (let row = 0; row < height; row += 1) {
    let source = ((rect.y + row) * stack.width + rect.x) * RGBA;
    let target = row * width * RGB;
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < RGB; channel += 1) {
        const difference =
          stack.mean[source + channel] - median[target + channel];
        ghost[target + channel] = difference;
        glowSource[target + channel] = difference > 0 ? difference : 0;
      }
      source += RGBA;
      target += RGB;
    }
  }
  const glowWeight = params.glow * GLOW_SCALE;
  // A blur whose weight is 0 cannot show, so it is not computed.
  const blurredGhost =
    params.ghostStrength === 0
      ? ghost
      : boxBlurFloat(ghost, rect, RGB, params.ghostBlur, BLUR_PASSES);
  const blurredGlow =
    glowWeight === 0
      ? glowSource
      : boxBlurFloat(
          glowSource,
          rect,
          RGB,
          2 * params.ghostBlur + GLOW_BLUR_MARGIN,
          BLUR_PASSES,
        );
  const output = new Uint8ClampedArray(pixelCount * RGBA);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const rgb = pixel * RGB;
    const rgba = pixel * RGBA;
    for (let channel = 0; channel < RGB; channel += 1) {
      output[rgba + channel] = Math.round(
        median[rgb + channel] +
          params.ghostStrength * blurredGhost[rgb + channel] +
          glowWeight * blurredGlow[rgb + channel],
      );
    }
    output[rgba + 3] = OPAQUE;
  }
  return { width, height, data: output };
}

// The RGB of `rect` from an RGBA buffer `sourceWidth` pixels wide, alpha dropped.
function cropChannels(
  source: Uint8ClampedArray,
  sourceWidth: number,
  rect: Rect,
): Uint8Array {
  const cropped = new Uint8Array(rect.width * rect.height * RGB);
  let target = 0;
  for (let row = 0; row < rect.height; row += 1) {
    let offset = ((rect.y + row) * sourceWidth + rect.x) * RGBA;
    for (let x = 0; x < rect.width; x += 1) {
      cropped[target] = source[offset];
      cropped[target + 1] = source[offset + 1];
      cropped[target + 2] = source[offset + 2];
      target += RGB;
      offset += RGBA;
    }
  }
  return cropped;
}
