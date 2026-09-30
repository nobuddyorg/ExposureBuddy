import { describe, expect, it, vi } from 'vitest';

import { createBandedRgb, rowOf } from '../image/banded';
import {
  allPixels,
  flatBanded,
  paintRect,
  rectSpans,
  type Rgb,
} from '../stack/synthetic.test-support';
import type { AlignedFrame, CompositeParams, RgbaImage } from '../types';
import { NO_OVERLAP_MESSAGE } from './protocol';
import { createStackSession } from './stackSession';

const WIDTH = 6;
const HEIGHT = 4;
const SIZE = { width: WIDTH, height: HEIGHT };
const ALL_ROWS = { start: 0, end: HEIGHT };

/** A flat image of one colour. */
function flat(
  red: number,
  green: number,
  blue: number,
  size = SIZE,
): RgbaImage {
  const data = new Uint8ClampedArray(size.width * size.height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = red;
    data[index + 1] = green;
    data[index + 2] = blue;
    data[index + 3] = 255;
  }
  return { ...size, data };
}

/** A frame of one colour covering all but its last `uncoveredColumns` columns. */
function covered(color: Rgb, uncoveredColumns = 0, size = SIZE): AlignedFrame {
  return {
    image: flatBanded(size, color),
    spans: rectSpans(size, {
      x: 0,
      y: 0,
      width: size.width - uncoveredColumns,
      height: size.height,
    }),
  };
}

/** A zeroed frame of `width × height`, covered nowhere. */
function blankFrame(width: number, height: number): AlignedFrame {
  const size = { width, height };
  return {
    image: createBandedRgb(size),
    spans: rectSpans(size, { x: 0, y: 0, width: 0, height: 0 }),
  };
}

const MEDIAN: CompositeParams = {
  background: 'median',
  ghostStrength: 0,
  ghostBlur: 0,
  glow: 0,
  trails: false,
};

describe('createStackSession', () => {
  it('insists on the reference first, once, and on matching sizes', () => {
    const session = createStackSession();
    expect(() => session.addFrame(1, covered([1, 1, 1]))).toThrow(/reference/);
    expect(() => session.crop()).toThrow(/reference/);
    expect(() => session.render(MEDIAN)).toThrow(/stacked/);
    expect(() => session.stackRows(ALL_ROWS)).toThrow(/stacked/);
    session.addReference(flat(1, 1, 1), HEIGHT);
    expect(() => session.addReference(flat(1, 1, 1), HEIGHT)).toThrow(
      /already/,
    );
    expect(() => session.addFrame(1, blankFrame(2, 2))).toThrow(/working size/);
    // Either dimension alone is enough to refuse the frame.
    expect(() => session.addFrame(1, blankFrame(WIDTH - 2, HEIGHT))).toThrow(
      /working size/,
    );
    expect(() => session.addFrame(1, blankFrame(WIDTH, HEIGHT + 2))).toThrow(
      /working size/,
    );
  });

  it('refuses the same burst index twice and rows for a frame it never got', () => {
    const session = createStackSession();
    session.addReference(flat(1, 2, 3), HEIGHT);
    session.addFrame(2, covered([1, 2, 3]));
    expect(() => session.addFrame(2, covered([1, 2, 3]))).toThrow(/twice/);
    expect(() => session.addRows(5, covered([1, 2, 3]), ALL_ROWS)).toThrow(
      /never added/,
    );
  });

  it('normalises each frame’s exposure to the reference before stacking', () => {
    const session = createStackSession();
    session.addReference(flat(100, 120, 140), HEIGHT);
    // Half as bright everywhere: the gain must bring it back to the reference.
    session.addFrame(0, covered([50, 60, 70]));
    session.addFrame(2, covered([50, 60, 70]));
    expect(session.frameCount).toBe(3);

    expect(session.crop()).toEqual({
      width: WIDTH,
      height: HEIGHT,
      rect: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      frameCount: 3,
    });
    const progress = vi.fn();
    session.stackRows(ALL_ROWS, progress);
    expect(progress).toHaveBeenLastCalledWith(1);
    expect(Array.from(session.render(MEDIAN).data.subarray(0, 4))).toEqual([
      100, 120, 140, 255,
    ]);
  });

  it('crops the result and the reference to what every frame covered', () => {
    const session = createStackSession();
    session.addReference(flat(10, 20, 30), HEIGHT);
    session.addFrame(1, covered([10, 20, 30], 2));

    expect(session.crop().rect).toEqual({
      x: 0,
      y: 0,
      width: WIDTH - 2,
      height: HEIGHT,
    });
    session.stackRows(ALL_ROWS);
    expect(session.render({ ...MEDIAN, ghostStrength: 1 })).toMatchObject({
      width: WIDTH - 2,
      height: HEIGHT,
    });
    const reference = session.renderReference();
    expect(reference).toMatchObject({ width: WIDTH - 2, height: HEIGHT });
    expect(Array.from(reference.data.subarray(0, 4))).toEqual([
      10, 20, 30, 255,
    ]);
  });

  it('still shows the reference after stacking has freed the frames of a tall burst', () => {
    const size = { width: 2, height: 150 };
    const data = new Uint8ClampedArray(size.width * size.height * 4).fill(255);
    data[(140 * size.width + 1) * 4] = 7;
    const session = createStackSession();
    session.addReference({ ...size, data }, size.height);
    session.crop();
    session.stackRows({ start: 0, end: size.height });
    const reference = session.renderReference();
    expect(reference.data[(140 * size.width + 1) * 4]).toBe(7);
    expect(reference.data[(140 * size.width + 1) * 4 + 1]).toBe(255);
  });

  it('keeps only the first strip of each frame on arrival, gain applied', () => {
    const size = { width: 2, height: 150 };
    const session = createStackSession();
    session.addReference(flat(100, 100, 100, size), 64);
    const frame = covered([50, 50, 50], 0, size);
    session.addFrame(1, frame);
    expect(frame.image.bands.map((band) => band.length)).toEqual([384, 0, 0]);
    expect(Array.from(rowOf(frame.image, 63).subarray(0, 3))).toEqual([
      100, 100, 100,
    ]);
  });

  it('stacks strip by strip to the same result as one pass', () => {
    const size = { width: 3, height: 150 };
    const reference = flat(100, 110, 120, size);
    const frameOf = (color: Rgb, ghostRow: number) => {
      const frame = covered(color, 0, size);
      paintRect(
        frame.image,
        { x: 1, y: ghostRow, width: 1, height: 1 },
        [250, 10, 90],
      );
      return frame;
    };
    const colors: Rgb[] = [
      [50, 55, 60],
      [100, 110, 120],
      [200, 220, 240],
    ];

    const whole = createStackSession();
    whole.addReference(reference, size.height);
    colors.forEach((color, index) =>
      whole.addFrame(index, frameOf(color, 60 + index * 30)),
    );
    whole.crop();
    whole.stackRows({ start: 0, end: size.height });

    const strips = createStackSession();
    strips.addReference(reference, 64);
    colors.forEach((color, index) =>
      strips.addFrame(index, frameOf(color, 60 + index * 30)),
    );
    strips.crop();
    strips.stackRows({ start: 0, end: 64 });
    for (const rows of [
      { start: 64, end: 128 },
      { start: 128, end: 150 },
    ]) {
      colors.forEach((color, index) => {
        // The strip as the align worker sends it again: only its rows, the gain not yet applied.
        const again = frameOf(color, 60 + index * 30);
        again.image.bands.forEach((_, band) => {
          if (band * 64 < rows.start || band * 64 >= rows.end)
            again.image.bands[band] = new Uint8ClampedArray(0);
        });
        strips.addRows(index, again, rows);
      });
      strips.stackRows(rows);
    }

    for (const params of [
      MEDIAN,
      { ...MEDIAN, ghostStrength: 1, ghostBlur: 3, glow: 0.5 },
    ]) {
      expect(strips.render(params)).toEqual(whole.render(params));
    }
    expect(strips.renderReference()).toEqual(whole.renderReference());
  });

  it('lets the frames go once they are folded into the stack', () => {
    const size = { width: 2, height: 150 };
    const session = createStackSession();
    session.addReference(flat(1, 2, 3, size), size.height);
    const frame = covered([1, 2, 3], 0, size);
    session.addFrame(1, frame);
    session.crop();
    session.stackRows({ start: 0, end: size.height });
    expect(frame.image.bands.map((band) => band.length)).toEqual([0, 0, 0]);
    expect(allPixels(frame.image)).toHaveLength(0);
  });

  it('refuses a burst whose aligned frames share no pixel', () => {
    const session = createStackSession();
    session.addReference(flat(1, 2, 3), HEIGHT);
    // One frame covers only the left half, the other only the right: nothing is covered by both.
    session.addFrame(1, covered([1, 2, 3], WIDTH / 2));
    session.addFrame(2, {
      image: flatBanded(SIZE, [1, 2, 3]),
      spans: rectSpans(SIZE, {
        x: WIDTH / 2,
        y: 0,
        width: WIDTH / 2,
        height: HEIGHT,
      }),
    });
    expect(() => session.crop()).toThrow(NO_OVERLAP_MESSAGE);
  });

  it('forgets everything on dispose', () => {
    const session = createStackSession();
    session.addReference(flat(1, 2, 3), HEIGHT);
    session.crop();
    session.dispose();
    expect(session.frameCount).toBe(0);
    expect(() => session.renderReference()).toThrow(/stacked/);
    expect(() => session.crop()).toThrow(/reference/);
  });
});
