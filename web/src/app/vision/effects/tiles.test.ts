import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { grayOf } from './effects.test-support';
import {
  addTileVotes,
  agreedMask,
  cropImage,
  emptyVotes,
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

  it('starts with the whole photo, then tiles of half and of 30 % of the shorter side', () => {
    const [whole, ...tiles] = segmentationTiles({ width: 900, height: 1600 });
    expect(whole).toEqual({ x: 0, y: 0, width: 900, height: 1600 });
    expect(tiles[0]).toEqual({ x: 0, y: 0, width: 450, height: 450 });
    expect(new Set(tiles.map((tile) => tile.width))).toEqual(
      new Set([450, 270]),
    );
    expect(tiles.filter((tile) => tile.width === 450)).toHaveLength(21);
  });

  it('leaves out a size that is no smaller than the photo, and merges sizes that come out equal', () => {
    const only = segmentationTiles({ width: 600, height: 700 });
    expect(new Set(only.slice(1).map((tile) => tile.width))).toEqual(
      new Set([300, 256]),
    );
    const merged = segmentationTiles({ width: 400, height: 700 });
    expect(new Set(merged.slice(1).map((tile) => tile.width))).toEqual(
      new Set([256]),
    );
    expect(segmentationTiles({ width: 500, height: 700 })).toHaveLength(1 + 15);
  });

  it('puts a tile every half tile along each side, the last flush with the end', () => {
    const tiles = segmentationTiles({ width: 900, height: 1600 }).filter(
      (tile) => tile.width === 270,
    );
    expect(tiles).toHaveLength(66);
    expect([...new Set(tiles.map((tile) => tile.x))]).toEqual([
      0, 126, 252, 378, 504, 630,
    ]);
    expect([...new Set(tiles.map((tile) => tile.y))]).toEqual([
      0, 133, 266, 399, 532, 665, 798, 931, 1064, 1197, 1330,
    ]);
  });

  it('never makes a tile smaller than the model sees', () => {
    const sides = segmentationTiles({ width: 600, height: 700 })
      .slice(1)
      .map((tile) => tile.width);
    expect(Math.min(...sides)).toBe(MODEL_SIDE);
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

describe('tile votes', () => {
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });

  it('keeps a pixel that a quarter of the tiles seeing it found a person in', () => {
    const votes = emptyVotes({ width: 2, height: 1 });
    for (const set of [255, 0, 0, 0]) {
      addTileVotes(votes, grayOf(1, 1, [set]), rect(0, 0, 1, 1));
    }
    addTileVotes(votes, grayOf(1, 1, [255]), rect(1, 0, 1, 1));
    expect(Array.from(votes.seen)).toEqual([4, 1]);
    expect(Array.from(votes.people)).toEqual([1, 1]);
    expect(Array.from(agreedMask(votes).data)).toEqual([255, 255]);
  });

  it('outvotes a pixel only a few of the many tiles saw as a person', () => {
    const votes = emptyVotes({ width: 1, height: 1 });
    for (const set of [255, 0, 0, 0, 0]) {
      addTileVotes(votes, grayOf(1, 1, [set]), rect(0, 0, 1, 1));
    }
    expect(Array.from(agreedMask(votes).data)).toEqual([0]);
  });

  it('never marks a pixel no tile found, and counts a mask value of 128 as found and 127 as not', () => {
    const votes = emptyVotes({ width: 3, height: 1 });
    addTileVotes(votes, grayOf(3, 1, [0, 128, 127]), rect(0, 0, 3, 1));
    expect(Array.from(agreedMask(votes).data)).toEqual([0, 255, 0]);
  });

  it('adds a tile at its own position, and leaves the pixels no tile saw out', () => {
    const votes = emptyVotes({ width: 3, height: 3 });
    addTileVotes(votes, grayOf(2, 2, [255, 0, 0, 255]), rect(1, 1, 2, 2));
    expect(Array.from(votes.seen)).toEqual([0, 0, 0, 0, 1, 1, 0, 1, 1]);
    expect(Array.from(votes.people)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(Array.from(agreedMask(votes).data)).toEqual([
      0, 0, 0, 0, 255, 0, 0, 0, 255,
    ]);
  });
});
