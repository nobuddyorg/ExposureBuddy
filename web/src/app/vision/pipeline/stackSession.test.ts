import { describe, expect, it, vi } from 'vitest';

import type { AlignedFrame, RgbaImage } from '../types';
import { NO_OVERLAP_MESSAGE } from './protocol';
import { createStackSession, cropRgba } from './stackSession';

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

function covered(image: RgbaImage, uncoveredColumns = 0): AlignedFrame {
  const coverage = new Uint8Array(WIDTH * HEIGHT).fill(1);
  for (let row = 0; row < HEIGHT; row += 1) {
    for (let column = WIDTH - uncoveredColumns; column < WIDTH; column += 1) {
      coverage[row * WIDTH + column] = 0;
    }
  }
  return { image, coverage };
}

describe('cropRgba', () => {
  it('copies exactly the rectangle, row by row', () => {
    const source = flat(0, 0, 0);
    for (let index = 0; index < WIDTH * HEIGHT; index += 1)
      source.data[index * 4] = index;
    const crop = cropRgba(source, { x: 2, y: 1, width: 3, height: 2 });
    expect(crop).toMatchObject({ width: 3, height: 2 });
    const reds = Array.from({ length: 6 }, (_, index) => crop.data[index * 4]);
    expect(reds).toEqual([8, 9, 10, 14, 15, 16]);
  });
});

describe('createStackSession', () => {
  it('insists on the reference first and on matching sizes', () => {
    const session = createStackSession();
    expect(() => session.addFrame(covered(flat(1, 1, 1)))).toThrow(/reference/);
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
    const small = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    expect(() =>
      session.addFrame({ image: small, coverage: new Uint8Array(4) }),
    ).toThrow(/working size/);
    // Either dimension alone is enough to refuse the frame.
    const narrow = flat(1, 1, 1);
    const wrongWidth = {
      width: narrow.width - 2,
      height: narrow.height,
      data: new Uint8ClampedArray((narrow.width - 2) * narrow.height * 4),
    };
    const wrongHeight = {
      width: narrow.width,
      height: narrow.height + 2,
      data: new Uint8ClampedArray(narrow.width * (narrow.height + 2) * 4),
    };
    for (const image of [wrongWidth, wrongHeight]) {
      expect(() =>
        session.addFrame({
          image,
          coverage: new Uint8Array(image.width * image.height),
        }),
      ).toThrow(/working size/);
    }
  });

  it('normalises each frame’s exposure to the reference before stacking', () => {
    const session = createStackSession();
    session.addReference(flat(100, 120, 140));
    // Half as bright everywhere: the gain must bring it back to the reference.
    session.addFrame(covered(flat(50, 60, 70)));
    session.addFrame(covered(flat(50, 60, 70)));
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
    session.addFrame(covered(flat(10, 20, 30), 2));

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
    session.addFrame(covered(flat(1, 2, 3)));
    expect(session.frameCount).toBe(2);
    expect(session.stack().frameCount).toBe(2);
    expect(session.frameCount).toBe(0);
    expect(session.renderReference().width).toBe(WIDTH);
  });

  it('refuses a burst whose aligned frames share no pixel', () => {
    const session = createStackSession();
    session.addReference(flat(1, 2, 3));
    // One frame covers only the left half, the other only the right: nothing is covered by both.
    const left = covered(flat(1, 2, 3), WIDTH / 2);
    const right = covered(flat(1, 2, 3));
    for (let index = 0; index < right.coverage.length; index += 1) {
      right.coverage[index] = index % WIDTH < WIDTH / 2 ? 0 : 1;
    }
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
    expect(() => session.renderReference()).toThrow(/reference/);
  });
});
