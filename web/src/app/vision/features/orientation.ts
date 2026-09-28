import type { GrayImage, Point } from '../types';

/** Returns ORB's intensity-centroid angle in radians, atan2(Σ y·I, Σ x·I) over the disc of `radius` around `center`, y downward, clamped to the image. */
export function intensityCentroidAngle(
  image: GrayImage,
  center: Point,
  radius: number,
): number {
  const { width, height, data } = image;
  const centerX = Math.round(center.x);
  const centerY = Math.round(center.y);
  const radiusSquared = radius * radius;
  const top = Math.max(-radius, -centerY);
  const bottom = Math.min(radius, height - 1 - centerY);
  const left = Math.max(-radius, -centerX);
  const right = Math.min(radius, width - 1 - centerX);
  let momentX = 0;
  let momentY = 0;
  for (let offsetY = top; offsetY <= bottom; offsetY += 1) {
    const rowIndex = (centerY + offsetY) * width + centerX;
    let rowSum = 0;
    for (let offsetX = left; offsetX <= right; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radiusSquared) continue;
      const intensity = data[rowIndex + offsetX];
      rowSum += intensity;
      momentX += offsetX * intensity;
    }
    momentY += offsetY * rowSum;
  }
  return Math.atan2(momentY, momentX);
}
