import { describe, expect, it, vi } from 'vitest';

import { createBandedRgb } from '../image/banded';
import {
  flatBanded,
  rectSpans,
  type Rgb,
} from '../stack/synthetic.test-support';
import type { AlignedFrame, RgbaImage } from '../types';
import { NO_OVERLAP_MESSAGE } from './protocol';
import { createStackSession } from './stackSession';

const WIDTH = 6;
const HEIGHT = 4;

/** A flat image of one colour. */
function flat(red: number, green: number, blue: number): RgbaImage {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = red;
    data[index + 1] = green;
    data[index + 2] = blue;
    data[index + 3] = 255;
  }
  return { width: WIDTH, height: HEIGHT, data };
}

/** A frame of one colour covering all but its last `uncoveredColumns` columns. */
function covered(color: Rgb, uncoveredColumns = 0): AlignedFrame {
  const size = { width: WIDTH, height: HEIGHT };
  return {
    image: flatBanded(size, color),
    spans: rectSpans(size, {
      x: 0,
      y: 0,
      width: WIDTH - uncoveredColumns,
      height: HEIGHT,
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

describe('createStackSession', () => {
  it('insists on the reference first and on matching sizes', () => {
    const session = createStackSession();
    expect(() => session.addFrame(covered([1, 1, 1]))).toThrow(/reference/);
    expect(() =>
      session.render({
        background: 'median',
        ghostStrength: 0,
        ghostBlur: 0,
        glow: 0,
      }),
    ).toThrow(/stacked/);
    session.addReference(flat(1, 1, 1));
    expect(() => session.addReference(flat(1, 1, 1))).toThrow(/already/);
    expect(() => session.addFrame(blankFrame(2, 2))).toThrow(/working size/);
    // Either dimension alone is enough to refuse the frame.
    expect(() => session.addFrame(blankFrame(WIDTH - 2, HEIGHT))).toThrow(
      /working size/,
    );
    expect(() => session.addFrame(blankFrame(WIDTH, HEIGHT + 2))).toThrow(
      /working size/,
    );
  });

  it('normalises each frame’s exposure to the reference before stacking', () => {
    const session = createStackSession();
    session.addReference(flat(100, 120, 140));
    // Half as bright everywhere: the gain must bring it back to the reference.
    session.addFrame(covered([50, 60, 70]));
    session.addFrame(covered([50, 60, 70]));
    expect(session.frameCount).toBe(3);

    const progress = vi.fn();
    const summary = session.stack(progress);
    expect(summary).toEqual({
      width: WIDTH,
      height: HEIGHT,
      rect: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      frameCount: 3,
    });
    expect(progress).toHaveBeenLastCalledWith(1);

    const median = session.render({
      background: 'median',
      ghostStrength: 0,
      ghostBlur: 0,
      glow: 0,
    });
    expect(Array.from(median.data.subarray(0, 4))).toEqual([
      100, 120, 140, 255,
    ]);
  });

  it('crops the result and the reference to what every frame covered', () => {
    const session = createStackSession();
    session.addReference(flat(10, 20, 30));
    session.addFrame(covered([10, 20, 30], 2));

    const summary = session.stack();
    expect(summary.rect).toEqual({
      x: 0,
      y: 0,
      width: WIDTH - 2,
      height: HEIGHT,
    });

    const rendered = session.render({
      background: 'median',
      ghostStrength: 1,
      ghostBlur: 0,
      glow: 0,
    });
    expect(rendered).toMatchObject({ width: WIDTH - 2, height: HEIGHT });
    const reference = session.renderReference();
    expect(reference).toMatchObject({ width: WIDTH - 2, height: HEIGHT });
    expect(Array.from(reference.data.subarray(0, 4))).toEqual([
      10, 20, 30, 255,
    ]);
  });

  it('lets the frames go once they are folded into the stack', () => {
    const session = createStackSession();
    session.addReference(flat(1, 2, 3));
    session.addFrame(covered([1, 2, 3]));
    expect(session.frameCount).toBe(2);
    expect(session.stack().frameCount).toBe(2);
    expect(session.frameCount).toBe(0);
    expect(session.renderReference().width).toBe(WIDTH);
  });

  it('still shows the reference after stacking has freed the frames of a tall burst', () => {
    const size = { width: 2, height: 150 };
    const data = new Uint8ClampedArray(size.width * size.height * 4).fill(255);
    data[(140 * size.width + 1) * 4] = 7;
    const session = createStackSession();
    session.addReference({ ...size, data });
    session.stack();
    const reference = session.renderReference();
    expect(reference.data[(140 * size.width + 1) * 4]).toBe(7);
    expect(reference.data[(140 * size.width + 1) * 4 + 1]).toBe(255);
  });

  it('refuses a burst whose aligned frames share no pixel', () => {
    const session = createStackSession();
    session.addReference(flat(1, 2, 3));
    // One frame covers only the left half, the other only the right: nothing is covered by both.
    const left = covered([1, 2, 3], WIDTH / 2);
    const right: AlignedFrame = {
      image: flatBanded({ width: WIDTH, height: HEIGHT }, [1, 2, 3]),
      spans: rectSpans(
        { width: WIDTH, height: HEIGHT },
        { x: WIDTH / 2, y: 0, width: WIDTH / 2, height: HEIGHT },
      ),
    };
    session.addFrame(left);
    session.addFrame(right);
    expect(() => session.stack()).toThrow(NO_OVERLAP_MESSAGE);
  });

  it('forgets everything on dispose', () => {
    const session = createStackSession();
    session.addReference(flat(1, 2, 3));
    session.stack();
    session.dispose();
    expect(session.frameCount).toBe(0);
    expect(() => session.renderReference()).toThrow(/stacked/);
  });
});
