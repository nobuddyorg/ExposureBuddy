import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { GrayImage } from '../types';
import { boxBlurGray } from './blur';

function impulse(
  width: number,
  height: number,
  x: number,
  y: number,
): GrayImage {
  const data = new Uint8Array(width * height);
  data[y * width + x] = 255;
  return { width, height, data };
}

describe('boxBlurGray', () => {
  it('returns an independent copy at radius 0', () => {
    const image = impulse(5, 5, 2, 2);
    const copy = boxBlurGray(image, 0);
    expect(copy.data).toEqual(image.data);
    expect(copy.data).not.toBe(image.data);
  });

  it('keeps a constant image constant, edges included', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 255 }),
        (width, height, radius, value) => {
          const flat = {
            width,
            height,
            data: new Uint8Array(width * height).fill(value),
          };
          const blurred = boxBlurGray(flat, radius);
          expect(blurred.data.every((pixel) => pixel === value)).toBe(true);
        },
      ),
    );
  });

  it('spreads an impulse evenly over the window and nowhere else', () => {
    const blurred = boxBlurGray(impulse(9, 9, 4, 4), 1);
    for (let y = 0; y < 9; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const inside = Math.abs(x - 4) <= 1 && Math.abs(y - 4) <= 1;
        expect(blurred.data[y * 9 + x]).toBe(inside ? Math.round(255 / 9) : 0);
      }
    }
  });

  it('replicates the edge, so a corner impulse counts more than once in its window', () => {
    const blurred = boxBlurGray(impulse(5, 5, 0, 0), 1);
    // The clamped window at (0, 0) sees the impulse 4 times out of 9.
    expect(blurred.data[0]).toBe(Math.round((4 * 255) / 9));
    expect(blurred.data[1]).toBe(Math.round((2 * 255) / 9));
    expect(blurred.data[6]).toBe(Math.round(255 / 9));
    expect(blurred.data[2]).toBe(0);
  });

  it('matches a brute-force clamped box average on random images', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        fc.integer({ min: 1, max: 7 }),
        fc.integer({ min: 1, max: 3 }),
        fc.array(fc.integer({ min: 0, max: 255 }), {
          minLength: 49,
          maxLength: 49,
        }),
        (width, height, radius, values) => {
          const image = {
            width,
            height,
            data: new Uint8Array(values.slice(0, width * height)),
          };
          const blurred = boxBlurGray(image, radius);
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              let sum = 0;
              for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                  const sx = Math.min(Math.max(x + dx, 0), width - 1);
                  const sy = Math.min(Math.max(y + dy, 0), height - 1);
                  sum += image.data[sy * width + sx];
                }
              }
              const window = (2 * radius + 1) ** 2;
              expect(blurred.data[y * width + x]).toBe(
                Math.round(sum / window),
              );
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
