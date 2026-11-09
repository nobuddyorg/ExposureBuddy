import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { identityHomography } from '../geometry/homography';
import type { GrayImage, Homography } from '../types';
import { warpMask } from './warpMask';

function maskOf(
  width: number,
  height: number,
  set: [number, number][],
): GrayImage {
  const data = new Uint8Array(width * height);
  set.forEach(([x, y]) => {
    data[y * width + x] = 255;
  });
  return { width, height, data };
}

const setPixels = (mask: GrayImage): [number, number][] =>
  [...mask.data.entries()]
    .filter(([, value]) => value > 0)
    .map(([index]) => [index % mask.width, Math.floor(index / mask.width)]);

const translation = (dx: number, dy: number): Homography =>
  Float64Array.from([1, 0, dx, 0, 1, dy, 0, 0, 1]);

describe('warpMask', () => {
  it('leaves the mask as it is for the identity', () => {
    const mask = maskOf(6, 4, [
      [1, 1],
      [4, 2],
    ]);
    expect(warpMask(mask, identityHomography())).toEqual(mask);
  });

  it('moves a set pixel by a translation, in x and in y', () => {
    const mask = maskOf(8, 6, [[2, 1]]);
    expect(setPixels(warpMask(mask, translation(3, 2)))).toEqual([[5, 3]]);
  });

  it('drops what moves out of the frame and leaves what comes in empty', () => {
    const mask = maskOf(5, 5, [
      [4, 4],
      [0, 0],
    ]);
    expect(setPixels(warpMask(mask, translation(1, 0)))).toEqual([[1, 0]]);
    expect(setPixels(warpMask(mask, translation(-1, -1)))).toEqual([[3, 3]]);
  });

  it('keeps the size and never changes the values it copies', () => {
    const mask: GrayImage = {
      width: 3,
      height: 2,
      data: Uint8Array.from([0, 90, 200, 255, 5, 128]),
    };
    const moved = warpMask(mask, translation(1, 0));
    expect([moved.width, moved.height]).toEqual([3, 2]);
    expect([...moved.data]).toEqual([0, 0, 90, 0, 255, 5]);
  });

  it('is undone by the inverse translation, for what stays inside', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -3, max: 3 }),
        fc.integer({ min: -3, max: 3 }),
        (dx, dy) => {
          const mask = maskOf(12, 12, [
            [5, 5],
            [6, 6],
          ]);
          const there = warpMask(mask, translation(dx, dy));
          expect(warpMask(there, translation(-dx, -dy))).toEqual(mask);
        },
      ),
    );
  });

  it('rejects a singular homography', () => {
    expect(() => warpMask(maskOf(2, 2, []), new Float64Array(9))).toThrow(
      /singular/,
    );
  });
});
