import type { GrayImage, Point, Rect, Size } from '../types';

/** Returns the summed-area table of `image`, (width + 1) × (height + 1) row-major; entry (x + 1, y + 1) sums the pixels in [0, x] × [0, y]. */
export function integralImage(image: GrayImage): Uint32Array {
  const { width, height, data } = image;
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  // Table row `row` holds the sums through image row `row - 1`; row 0 stays zero.
  for (let row = 1; row <= height; row += 1) {
    let rowSum = 0;
    const sourceRow = (row - 1) * width;
    const targetRow = row * stride;
    const previousRow = targetRow - stride;
    for (let x = 0; x < width; x += 1) {
      rowSum += data[sourceRow + x];
      integral[targetRow + x + 1] = integral[previousRow + x + 1] + rowSum;
    }
  }
  return integral;
}

/** Returns the sum of the pixels inside `rect` (exclusive far edges), which must lie within the `width`-wide image the table was built from. */
export function boxSum(
  integral: Uint32Array,
  width: number,
  rect: Rect,
): number {
  const stride = width + 1;
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y * stride;
  const bottom = (rect.y + rect.height) * stride;
  return (
    integral[bottom + right] -
    integral[top + right] -
    integral[bottom + left] +
    integral[top + left]
  );
}

/** Returns the mean over the (2·radius + 1)² box around `center`, clamped to the image so an edge box averages only real pixels. */
export function boxMean(
  integral: Uint32Array,
  imageSize: Size,
  center: Point,
  radius: number,
): number {
  const centerX = Math.round(center.x);
  const centerY = Math.round(center.y);
  const left = Math.max(0, centerX - radius);
  const top = Math.max(0, centerY - radius);
  const right = Math.min(imageSize.width, centerX + radius + 1);
  const bottom = Math.min(imageSize.height, centerY + radius + 1);
  const rect = { x: left, y: top, width: right - left, height: bottom - top };
  return boxSum(integral, imageSize.width, rect) / (rect.width * rect.height);
}
