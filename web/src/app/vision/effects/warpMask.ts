import { invertHomography } from '../geometry/homography';
import { indices } from '../indices';
import type { GrayImage, Homography } from '../types';

/**
 * `mask` moved through `homography` (source → target, in the mask's own pixel coordinates) onto a same-sized target by nearest
 * neighbour; what falls outside the source is 0. Throws when the homography is singular.
 */
export function warpMask(mask: GrayImage, homography: Homography): GrayImage {
  const inverse = invertHomography(homography);
  if (inverse === null) throw new Error('warpMask: the homography is singular');
  const { width, height } = mask;
  const data = new Uint8Array(width * height);
  for (const y of indices(height)) {
    for (const x of indices(width)) {
      const w = inverse[6] * x + inverse[7] * y + inverse[8];
      const sourceX = Math.round(
        (inverse[0] * x + inverse[1] * y + inverse[2]) / w,
      );
      const sourceY = Math.round(
        (inverse[3] * x + inverse[4] * y + inverse[5]) / w,
      );
      if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height)
        continue;
      data[y * width + x] = mask.data[sourceY * width + sourceX];
    }
  }
  return { width, height, data };
}
