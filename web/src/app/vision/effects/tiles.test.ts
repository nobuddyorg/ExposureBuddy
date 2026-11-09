import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { grayOf } from './effects.test-support';
import {
  cropImage,
  mergeTileMask,
  MODEL_SIDE,
  segmentationTiles,
} from './tiles';

describe('segmentationTiles', () => {
  it('is the whole photo alone when a tile would be as large as the photo', () => {
    expect(segmentationTiles({ width: 200, height: 100 })).toEqual([
      { x: 0, y: 0, width: 200, height: 100 },
    ]);
    expect(segmentationTiles({ width: 800, height: MODEL_SIDE })).toEqual([
      { x: 0, y: 0, width: 800, height: MODEL_SIDE },
    ]);
  });

  it('starts with the whole photo, then tiles of 30 % of the shorter side', () => {
    const [whole, first, second] = segmentationTiles({
      width: 900,
      height: 1600,
    });
    expect(whole).toEqual({ x: 0, y: 0, width: 900, height: 1600 });
    expect(first).toEqual({ x: 0, y: 0, width: 270, height: 270 });
    expect(second.x).toBeGreaterThan(0);
    expect(second.x).toBeLessThanOrEqual(135);
  });

  it('puts a tile every half tile along each side, the last flush with the end', () => {
    const [, ...tiles] = segmentationTiles({ width: 900, height: 1600 });
    expect(tiles).toHaveLength(66);
    expect([...new Set(tiles.map((tile) => tile.x))]).toEqual([
      0, 126, 252, 378, 504, 630,
    ]);
    expect([...new Set(tiles.map((tile) => tile.y))]).toEqual([
      0, 133, 266, 399, 532, 665, 798, 931, 1064, 1197, 1330,
    ]);
  });

  it('never makes a tile smaller than the model sees', () => {
    const [, tile] = segmentationTiles({ width: 600, height: 700 });
    expect(tile.width).toBe(MODEL_SIDE);
  });

  it('covers every pixel, stays inside the photo and overlaps its neighbours', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 300, max: 1700 }),
        fc.integer({ min: 300, max: 1700 }),
        (width, height) => {
          const [, ...tiles] = segmentationTiles({ width, height });
          const covered = new Uint8Array(width * height);
          for (const tile of tiles) {
            expect(tile.x).toBeGreaterThanOrEqual(0);
            expect(tile.y).toBeGreaterThanOrEqual(0);
            expect(tile.x + tile.width).toBeLessThanOrEqual(width);
            expect(tile.y + tile.height).toBeLessThanOrEqual(height);
            for (let y = tile.y; y < tile.y + tile.height; y += 1)
              covered.fill(
                1,
                y * width + tile.x,
                y * width + tile.x + tile.width,
              );
          }
          expect(covered.every((value) => value === 1)).toBe(true);
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe('cropImage', () => {
  it('cuts the rows and columns of the rectangle', () => {
    const data = Uint8ClampedArray.from({ length: 4 * 4 * 4 }, (_, i) => i);
    const cut = cropImage(
      { width: 4, height: 4, data },
      { x: 1, y: 1, width: 2, height: 3 },
    );
    expect([cut.width, cut.height]).toEqual([2, 3]);
    expect(Array.from(cut.data)).toEqual([
      ...[20, 21, 22, 23, 24, 25, 26, 27],
      ...[36, 37, 38, 39, 40, 41, 42, 43],
      ...[52, 53, 54, 55, 56, 57, 58, 59],
    ]);
  });
});

describe('mergeTileMask', () => {
  it('raises the target where the tile has people and keeps what it already had', () => {
    const target = grayOf(3, 2, [0, 255, 0, 0, 0, 90]);
    mergeTileMask(target, grayOf(2, 2, [255, 0, 0, 40]), {
      x: 1,
      y: 0,
      width: 2,
      height: 2,
    });
    expect(Array.from(target.data)).toEqual([0, 255, 0, 0, 0, 90]);
    mergeTileMask(target, grayOf(2, 2, [0, 255, 255, 0]), {
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
    expect(Array.from(target.data)).toEqual([0, 255, 0, 255, 0, 90]);
  });
});
