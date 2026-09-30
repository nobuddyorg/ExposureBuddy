import { rowOf } from '../image/banded';
import type { CompositeParams, RgbaImage, StackResult } from '../types';
import { boxBlurInPlace } from './boxBlur';

const GLOW_SCALE = 1.5;
const GLOW_BLUR_MARGIN = 6;
const BLUR_PASSES = 3;
const RGB = 3;
const RGBA = 4;
const OPAQUE = 255;

/**
 * Returns the composite `background + ghostStrength × blur(mean − background) + glow × 1.5 × blur(max(mean − background, 0))`, opaque.
 * One colour channel at a time, so only two single-channel float layers exist at once.
 */
export function composite(
  stack: StackResult,
  params: CompositeParams,
): RgbaImage {
  const { width, height } = stack;
  const background = stack.backgrounds[params.background];
  const ghost = new Float32Array(width * height);
  const glowSource = new Float32Array(width * height);
  const glowWeight = params.glow * GLOW_SCALE;
  // Opaque from the start; the channel passes below write red, green and blue only.
  const output = new Uint8ClampedArray(width * height * RGBA).fill(OPAQUE);
  for (let channel = 0; channel < RGB; channel += 1) {
    let pixel = 0;
    for (let y = 0; y < height; y += 1) {
      const meanRow = rowOf(stack.mean, y);
      const backgroundRow = rowOf(background, y);
      for (let offset = channel; offset < meanRow.length; offset += RGB) {
        const difference = meanRow[offset] - backgroundRow[offset];
        ghost[pixel] = difference;
        glowSource[pixel] = Math.max(difference, 0);
        pixel += 1;
      }
    }
    // A blur whose weight is 0 cannot show, so it is not computed.
    if (params.ghostStrength !== 0)
      boxBlurInPlace(ghost, stack, params.ghostBlur, BLUR_PASSES);
    if (glowWeight !== 0)
      boxBlurInPlace(
        glowSource,
        stack,
        2 * params.ghostBlur + GLOW_BLUR_MARGIN,
        BLUR_PASSES,
      );
    pixel = 0;
    for (let y = 0; y < height; y += 1) {
      const backgroundRow = rowOf(background, y);
      for (let offset = channel; offset < backgroundRow.length; offset += RGB) {
        output[pixel * RGBA + channel] = Math.round(
          backgroundRow[offset] +
            params.ghostStrength * ghost[pixel] +
            glowWeight * glowSource[pixel],
        );
        pixel += 1;
      }
    }
  }
  return { width, height, data: output };
}
