import type { CompositeParams, Rect, RgbaImage, StackResult } from '../types';
import { boxBlurFloat } from './boxBlur';

const GLOW_SCALE = 1.5;
const GLOW_BLUR_MARGIN = 6;
const BLUR_PASSES = 3;
const RGB = 3;
const RGBA = 4;
const OPAQUE = 255;

/** Returns the `rect`-sized composite `median + ghostStrength × blur(mean − median) + glow × 1.5 × blur(max(mean − median, 0))`, opaque; reads only pixels inside `rect`. */
export function composite(
  stack: StackResult,
  params: CompositeParams,
  rect: Rect,
): RgbaImage {
  const { width, height } = rect;
  const pixelCount = width * height;
  const rowStarts = rectRowStarts(stack.width, rect);
  const ghost = new Float32Array(pixelCount * RGB);
  const glowSource = new Float32Array(pixelCount * RGB);
  let target = 0;
  for (const rowStart of rowStarts) {
    let source = rowStart;
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < RGB; channel += 1) {
        const difference =
          stack.mean[source + channel] - stack.median[source + channel];
        ghost[target] = difference;
        glowSource[target] = Math.max(difference, 0);
        target += 1;
      }
      source += RGBA;
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
  const rowBytes = width * RGBA;
  let rgb = 0;
  let rgba = 0;
  for (const rowStart of rowStarts) {
    // Each row starts as the median; the ghost and the glow are added in place.
    output.set(stack.median.subarray(rowStart, rowStart + rowBytes), rgba);
    for (let x = 0; x < width; x += 1) {
      output[rgba + 3] = OPAQUE;
      for (let channel = 0; channel < RGB; channel += 1) {
        output[rgba + channel] = Math.round(
          output[rgba + channel] +
            params.ghostStrength * blurredGhost[rgb] +
            glowWeight * blurredGlow[rgb],
        );
        rgb += 1;
      }
      rgba += RGBA;
    }
  }
  return { width, height, data: output };
}

// The RGBA offset at which each row of `rect` starts in a buffer `sourceWidth` pixels wide.
function rectRowStarts(sourceWidth: number, rect: Rect): number[] {
  return Array.from(
    { length: rect.height },
    (_, row) => ((rect.y + row) * sourceWidth + rect.x) * RGBA,
  );
}
