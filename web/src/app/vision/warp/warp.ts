import { invertHomography } from '../geometry/homography';
import type { AlignedFrame, Homography, RgbaImage, Size } from '../types';

const CHANNELS = 4;
const OPAQUE = 255;

/** Returns `source` inverse-warped through `homography` (source → target) into a `target`-sized frame with a coverage mask; throws when the homography is singular. */
export function warpRgba(
  source: RgbaImage,
  homography: Homography,
  target: Size,
): AlignedFrame {
  const inverse = invertHomography(homography);
  if (inverse === null) {
    throw new Error('warpRgba: the homography is singular');
  }
  const { width, height } = target;
  const output = new Uint8ClampedArray(width * height * CHANNELS);
  const coverage = new Uint8Array(width * height);
  const sourceWidth = source.width;
  const sourceData = source.data;
  const maxX = sourceWidth - 1;
  const maxY = source.height - 1;
  const [stepX, , , stepY, , , stepW] = inverse;
  for (let y = 0; y < height; y += 1) {
    // Homogeneous source coordinates of (0, y), advanced by one column per step.
    let homogeneousX = inverse[1] * y + inverse[2];
    let homogeneousY = inverse[4] * y + inverse[5];
    let homogeneousW = inverse[7] * y + inverse[8];
    let outputOffset = y * width * CHANNELS;
    let pixel = y * width;
    for (let x = 0; x < width; x += 1) {
      const sourceX = homogeneousX / homogeneousW;
      const sourceY = homogeneousY / homogeneousW;
      // w ≤ 0 is behind the camera; w = 0 yields NaN, which also fails the range checks.
      const covered =
        homogeneousW > 0 &&
        sourceX >= 0 &&
        sourceX <= maxX &&
        sourceY >= 0 &&
        sourceY <= maxY;
      homogeneousX += stepX;
      homogeneousY += stepY;
      homogeneousW += stepW;
      if (covered) {
        // Bilinear over the 2×2 neighbourhood; on the last row or column the far weight is exactly 0.
        const x0 = Math.floor(sourceX);
        const y0 = Math.floor(sourceY);
        const fractionX = sourceX - x0;
        const fractionY = sourceY - y0;
        const weight00 = (1 - fractionX) * (1 - fractionY);
        const weight10 = fractionX * (1 - fractionY);
        const weight01 = (1 - fractionX) * fractionY;
        const weight11 = fractionX * fractionY;
        const offset00 = (y0 * sourceWidth + x0) * CHANNELS;
        const offset10 = x0 < maxX ? offset00 + CHANNELS : offset00;
        const offset01 =
          y0 < maxY ? offset00 + sourceWidth * CHANNELS : offset00;
        const offset11 = offset01 + (offset10 - offset00);
        output[outputOffset] =
          weight00 * sourceData[offset00] +
          weight10 * sourceData[offset10] +
          weight01 * sourceData[offset01] +
          weight11 * sourceData[offset11];
        output[outputOffset + 1] =
          weight00 * sourceData[offset00 + 1] +
          weight10 * sourceData[offset10 + 1] +
          weight01 * sourceData[offset01 + 1] +
          weight11 * sourceData[offset11 + 1];
        output[outputOffset + 2] =
          weight00 * sourceData[offset00 + 2] +
          weight10 * sourceData[offset10 + 2] +
          weight01 * sourceData[offset01 + 2] +
          weight11 * sourceData[offset11 + 2];
        output[outputOffset + 3] = OPAQUE;
        coverage[pixel] = 1;
      }
      outputOffset += CHANNELS;
      pixel += 1;
    }
  }
  return { image: { width, height, data: output }, coverage };
}
