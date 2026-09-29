import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { GrayImage, Rect } from '../types';
import { boxMean, boxSum, integralImage } from './integral';

function bruteForceSum(image: GrayImage, rect: Rect): number {
  let sum = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      sum += image.data[y * image.width + x];
    }
  }
  return sum;
}

const smallImage = fc
  .tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }))
  .chain(([width, height]) =>
    fc
      .array(fc.integer({ min: 0, max: 255 }), {
        minLength: width * height,
        maxLength: width * height,
      })
      .map((values): GrayImage => ({
        width,
        height,
        data: new Uint8Array(values),
      })),
  );

function rectWithin(image: GrayImage): fc.Arbitrary<Rect> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: image.width - 1 }),
      fc.integer({ min: 0, max: image.height - 1 }),
    )
    .chain(([x, y]) =>
      fc
        .tuple(
          fc.integer({ min: 0, max: image.width - x }),
          fc.integer({ min: 0, max: image.height - y }),
        )
        .map(([width, height]) => ({ x, y, width, height })),
    );
}

describe('integralImage', () => {
  it('has a zero first row and column and accumulates the rest', () => {
    const image: GrayImage = {
      width: 3,
      height: 2,
      data: new Uint8Array([1, 2, 3, 4, 5, 6]),
    };
    expect(Array.from(integralImage(image))).toEqual([
      0, 0, 0, 0, 0, 1, 3, 6, 0, 5, 12, 21,
    ]);
  });

  it('reads back any box as the brute-force sum', () => {
    fc.assert(
      fc.property(
        smallImage.chain((image) =>
          rectWithin(image).map((rect) => ({ image, rect })),
        ),
        ({ image, rect }) => {
          const integral = integralImage(image);
          expect(boxSum(integral, image.width, rect)).toBe(
            bruteForceSum(image, rect),
          );
        },
      ),
    );
  });
});

describe('boxMean', () => {
  const image: GrayImage = {
    width: 4,
    height: 3,
    data: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
  };
  const integral = integralImage(image);

  it('averages the full window inside the image', () => {
    expect(boxMean(integral, image, { x: 1, y: 1 }, 1)).toBe(60);
  });

  it('averages only the pixels that exist when the window crosses an edge', () => {
    expect(boxMean(integral, image, { x: 0, y: 0 }, 1)).toBe(35);
    expect(boxMean(integral, image, { x: 3, y: 2 }, 1)).toBe(95);
  });

  it('is the pixel itself at radius 0 and rounds a fractional centre', () => {
    expect(boxMean(integral, image, { x: 2, y: 1 }, 0)).toBe(70);
    expect(boxMean(integral, image, { x: 2.4, y: 0.6 }, 0)).toBe(70);
  });

  it('is the constant for a constant image, whatever the window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 4 }),
        (value, x, y, radius) => {
          const flat: GrayImage = {
            width: 6,
            height: 6,
            data: new Uint8Array(36).fill(value),
          };
          expect(boxMean(integralImage(flat), flat, { x, y }, radius)).toBe(
            value,
          );
        },
      ),
    );
  });
});
