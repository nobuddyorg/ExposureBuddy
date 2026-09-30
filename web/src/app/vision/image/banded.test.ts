import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { noiseRgba } from '../golden.test-support';
import {
  BAND_ROWS,
  allocateBand,
  bandCount,
  bandedFromRgba,
  createBandedRgb,
  cropBanded,
  emptyBandedRgb,
  releaseBandsAbove,
  rowOf,
  toRgba,
} from './banded';

describe('bandCount', () => {
  it('rounds a partial band up', () => {
    expect(bandCount(64, 64)).toBe(1);
    expect(bandCount(65, 64)).toBe(2);
    expect(bandCount(1, 64)).toBe(1);
  });
});

describe('createBandedRgb', () => {
  it('allocates every band zeroed, the last one only as tall as the rows left', () => {
    const image = createBandedRgb({ width: 2, height: 7 }, 3);
    expect(image).toMatchObject({ width: 2, height: 7, bandRows: 3 });
    expect(image.bands.map((band) => band.length)).toEqual([18, 18, 6]);
    expect(
      image.bands.every((band) => band.every((value) => value === 0)),
    ).toBe(true);
  });

  it('uses the default band height', () => {
    expect(createBandedRgb({ width: 1, height: 1 }).bandRows).toBe(BAND_ROWS);
  });
});

describe('emptyBandedRgb and allocateBand', () => {
  it('starts with every band empty and fills in one on request', () => {
    const image = emptyBandedRgb({ width: 2, height: 5 }, 2);
    expect(image.bands.map((band) => band.length)).toEqual([0, 0, 0]);
    const band = allocateBand(image, 2);
    expect(band).toBe(image.bands[2]);
    expect(image.bands.map((each) => each.length)).toEqual([0, 0, 6]);
  });

  it('uses the default band height', () => {
    expect(emptyBandedRgb({ width: 1, height: 1 }).bandRows).toBe(BAND_ROWS);
  });
});

describe('rowOf', () => {
  it('views one row of the band holding it', () => {
    const image = createBandedRgb({ width: 2, height: 5 }, 2);
    rowOf(image, 3).set([1, 2, 3, 4, 5, 6]);
    expect(Array.from(image.bands[1])).toEqual([
      0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(rowOf(image, 4)).toHaveLength(6);
    expect(rowOf(image, 4).buffer).toBe(image.bands[2].buffer);
  });
});

describe('releaseBandsAbove', () => {
  it('frees the bands wholly above the row and keeps the one holding it', () => {
    const image = createBandedRgb({ width: 1, height: 9 }, 2);
    releaseBandsAbove(image, 5);
    expect(image.bands.map((band) => band.length)).toEqual([0, 0, 6, 6, 3]);
    expect(rowOf(image, 1)).toHaveLength(0);
  });

  it('frees nothing above the first band', () => {
    const image = createBandedRgb({ width: 1, height: 4 }, 2);
    releaseBandsAbove(image, 1);
    expect(image.bands.map((band) => band.length)).toEqual([6, 6]);
  });
});

describe('bandedFromRgba and toRgba', () => {
  it('drops the alpha channel and puts it back opaque', () => {
    const rgba = {
      width: 2,
      height: 1,
      data: Uint8ClampedArray.from([1, 2, 3, 40, 5, 6, 7, 80]),
    };
    const banded = bandedFromRgba(rgba);
    expect(Array.from(rowOf(banded, 0))).toEqual([1, 2, 3, 5, 6, 7]);
    expect(Array.from(toRgba(banded).data)).toEqual([
      1, 2, 3, 255, 5, 6, 7, 255,
    ]);
  });

  it('round-trips any opaque image whatever the band height', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer(),
        (width, height, bandRows, seed) => {
          const image = noiseRgba(width, height, seed);
          expect(toRgba(bandedFromRgba(image, bandRows))).toEqual(image);
        },
      ),
    );
  });
});

describe('cropBanded', () => {
  it('copies exactly the rectangle, across bands, keeping the band height', () => {
    const source = bandedFromRgba(noiseRgba(6, 7, 5), 2);
    const rect = { x: 2, y: 1, width: 3, height: 4 };
    const crop = cropBanded(source, rect);
    expect(crop).toMatchObject({ width: 3, height: 4, bandRows: 2 });
    for (let y = 0; y < rect.height; y += 1) {
      expect(Array.from(rowOf(crop, y))).toEqual(
        Array.from(rowOf(source, rect.y + y).subarray(2 * 3, 5 * 3)),
      );
    }
  });
});
