import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { grayOf } from './effects.test-support';
import {
  addTileVotes,
  agreedMask,
  cropImage,
  DETECTION_DETAILS,
  emptyVotes,
  segmentationTiles,
  type DetectionDetail,
} from './tiles';

const tilesOf = (width: number, height: number, detail: DetectionDetail) =>
  segmentationTiles({ width, height }, detail).slice(1);
const sidesOf = (tiles: readonly { width: number }[]) =>
  new Set(tiles.map((tile) => tile.width));

describe('segmentationTiles', () => {
  it('is the whole photo alone when no tile would be smaller than the photo', () => {
    for (const detail of DETECTION_DETAILS) {
      expect(segmentationTiles({ width: 90, height: 90 }, detail)).toEqual([
        { x: 0, y: 0, width: 90, height: 90 },
      ]);
      expect(segmentationTiles({ width: 96, height: 500 }, detail)).toEqual([
        { x: 0, y: 0, width: 96, height: 500 },
      ]);
    }
  });

  it('starts with the whole photo', () => {
    expect(segmentationTiles({ width: 900, height: 1600 }, 'fast')[0]).toEqual({
      x: 0,
      y: 0,
      width: 900,
      height: 1600,
    });
  });

  it('reads tiles of half and of 30 % of the shorter side when fast', () => {
    const tiles = tilesOf(900, 1600, 'fast');
    expect(tiles[0]).toEqual({ x: 0, y: 0, width: 450, height: 450 });
    expect(sidesOf(tiles)).toEqual(new Set([450, 270]));
    expect(tiles.filter((tile) => tile.width === 450)).toHaveLength(21);
    expect(tiles.filter((tile) => tile.width === 270)).toHaveLength(66);
  });

  it('also reads tiles of 20 % and of 14 % when thorough', () => {
    const tiles = tilesOf(900, 1600, 'thorough');
    expect(sidesOf(tiles)).toEqual(new Set([450, 270, 180, 126]));
    expect(tiles.filter((tile) => tile.width === 180)).toHaveLength(153);
    expect(tiles.filter((tile) => tile.width === 126)).toHaveLength(350);
  });

  it('puts a tile every half tile along each side, the last flush with the end', () => {
    const tiles = tilesOf(900, 1600, 'fast').filter(
      (tile) => tile.width === 270,
    );
    expect([...new Set(tiles.map((tile) => tile.x))]).toEqual([
      0, 126, 252, 378, 504, 630,
    ]);
    expect([...new Set(tiles.map((tile) => tile.y))]).toEqual([
      0, 133, 266, 399, 532, 665, 798, 931, 1064, 1197, 1330,
    ]);
  });

  it('never makes a tile smaller than 96 pixels, and merges sizes that come out equal', () => {
    expect(sidesOf(tilesOf(400, 400, 'thorough'))).toEqual(
      new Set([200, 120, 96]),
    );
    expect(sidesOf(tilesOf(300, 700, 'thorough'))).toEqual(new Set([150, 96]));
    expect(sidesOf(tilesOf(300, 700, 'fast'))).toEqual(new Set([150, 96]));
  });

  it('covers every pixel, stays inside the photo and overlaps its neighbours', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DETECTION_DETAILS),
        fc.integer({ min: 300, max: 1700 }),
        fc.integer({ min: 300, max: 1700 }),
        (detail, width, height) => {
          const covered = new Uint8Array(width * height);
          for (const tile of tilesOf(width, height, detail)) {
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
      { numRuns: 20 },
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
    expect(Array.from(agreedMask(votes, 'fast').data)).toEqual([255, 255]);
  });

  it('outvotes a pixel only a few of the many tiles saw as a person', () => {
    const votes = emptyVotes({ width: 1, height: 1 });
    for (const set of [255, 0, 0, 0, 0]) {
      addTileVotes(votes, grayOf(1, 1, [set]), rect(0, 0, 1, 1));
    }
    expect(Array.from(agreedMask(votes, 'fast').data)).toEqual([0]);
  });

  it('never marks a pixel no tile found, and counts a mask value of 128 as found and 127 as not', () => {
    const votes = emptyVotes({ width: 3, height: 1 });
    addTileVotes(votes, grayOf(3, 1, [0, 128, 127]), rect(0, 0, 3, 1));
    expect(Array.from(agreedMask(votes, 'fast').data)).toEqual([0, 255, 0]);
  });

  it('adds a tile at its own position, and leaves the pixels no tile saw out', () => {
    const votes = emptyVotes({ width: 3, height: 3 });
    addTileVotes(votes, grayOf(2, 2, [255, 0, 0, 255]), rect(1, 1, 2, 2));
    expect(Array.from(votes.seen)).toEqual([0, 0, 0, 0, 1, 1, 0, 1, 1]);
    expect(Array.from(votes.people)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(Array.from(agreedMask(votes, 'fast').data)).toEqual([
      0, 0, 0, 0, 255, 0, 0, 0, 255,
    ]);
  });
});
