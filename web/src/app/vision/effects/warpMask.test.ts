import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  applyHomography,
  identityHomography,
  invertHomography,
} from '../geometry/homography';
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

  it('drops what leaves past the right edge instead of wrapping it into the row above', () => {
    const mask = maskOf(5, 5, [[0, 2]]);
    expect(setPixels(warpMask(mask, translation(-1, 0)))).toEqual([]);
  });

  it('samples a perspective warp at the nearest source pixel', () => {
    const targetToSource = Float64Array.from([
      1, 0.2, 0, 0.1, 1, 0, 0.02, 0.03, 1,
    ]);
    const homography = invertHomography(targetToSource);
    expect(homography).not.toBeNull();
    if (homography === null) return;
    const size = 12;
    const mask: GrayImage = {
      width: size,
      height: size,
      data: Uint8Array.from({ length: size * size }, (_, index) => index + 1),
    };
    const warped = warpMask(mask, homography);
    let inside = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const source = applyHomography(targetToSource, { x, y });
        const sourceX = Math.round(source.x);
        const sourceY = Math.round(source.y);
        const within =
          sourceX >= 0 && sourceX < size && sourceY >= 0 && sourceY < size;
        if (within) inside += 1;
        const expected = within ? mask.data[sourceY * size + sourceX] : 0;
        expect(warped.data[y * size + x]).toBe(expected);
      }
    }
    expect(inside).toBeGreaterThan(50);
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
