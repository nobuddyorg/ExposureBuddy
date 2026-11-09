import { describe, expect, it } from 'vitest';

import type { AlignedFrame, GrayImage, Rect } from '../types';
import {
  flatFrame,
  paintRect,
  pixelOf,
  stackFrames,
} from './synthetic.test-support';

const SIZE = { width: 8, height: 8 };
const RECT: Rect = { x: 0, y: 0, ...SIZE };
const SCENE = [100, 100, 100] as const;
const PERSON = [240, 20, 20] as const;
const PERSON_AT: Rect = { x: 2, y: 2, width: 3, height: 3 };

/** Five frames; a person stands at PERSON_AT in `standing` of them. */
function crowd(standing: readonly number[]): AlignedFrame[] {
  return Array.from({ length: 5 }, (_, index) => {
    const frame = flatFrame(SIZE, SCENE, 3);
    if (standing.includes(index)) paintRect(frame.image, PERSON_AT, PERSON);
    return frame;
  });
}

function personMask(
  size: { width: number; height: number },
  rect: Rect,
): GrayImage {
  const data = new Uint8Array(size.width * size.height);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1)
      data[y * size.width + x] = 255;
  }
  return { ...size, data };
}

const noOne: GrayImage = { ...SIZE, data: new Uint8Array(64) };

function backgroundAt(
  frames: AlignedFrame[],
  hidden: readonly GrayImage[] | undefined,
  x: number,
  y: number,
): number[] {
  const stack = stackFrames(frames, { rect: RECT, hidden });
  return pixelOf(stack.backgrounds.median, x, y);
}

describe('stackFrames with people masks', () => {
  const standing = [0, 1, 2];
  const masks = (): GrayImage[] =>
    [0, 1, 2, 3, 4].map((index) =>
      standing.includes(index) ? personMask(SIZE, PERSON_AT) : noOne,
    );

  it('shows the person in the plain median when most frames have one', () => {
    expect(backgroundAt(crowd(standing), undefined, 3, 3)).toEqual([...PERSON]);
  });

  it('shows the scene when the frames with a person are left out', () => {
    expect(backgroundAt(crowd(standing), masks(), 3, 3)).toEqual([...SCENE]);
  });

  it('does not change a pixel no mask covers', () => {
    expect(backgroundAt(crowd(standing), masks(), 0, 0)).toEqual([...SCENE]);
    expect(backgroundAt(crowd(standing), masks(), 6, 6)).toEqual([...SCENE]);
  });

  it('keeps the mean, the brightest layer and the other backgrounds as they were', () => {
    const plain = stackFrames(crowd(standing), { rect: RECT });
    const masked = stackFrames(crowd(standing), {
      rect: RECT,
      hidden: masks(),
    });
    expect(pixelOf(masked.mean, 3, 3)).toEqual(pixelOf(plain.mean, 3, 3));
    expect(pixelOf(masked.brightest, 3, 3)).toEqual(
      pixelOf(plain.brightest, 3, 3),
    );
    expect(pixelOf(masked.backgrounds.trimmed, 3, 3)).toEqual(
      pixelOf(plain.backgrounds.trimmed, 3, 3),
    );
  });

  it('falls back to the plain median where every frame shows a person', () => {
    const everyone = [0, 1, 2, 3, 4];
    const allMasks = everyone.map(() => personMask(SIZE, PERSON_AT));
    expect(backgroundAt(crowd(everyone), allMasks, 3, 3)).toEqual([...PERSON]);
  });

  it('lays a mask of another size over the frame', () => {
    // A 4 × 4 mask: its cell (1, 1) covers the frame's pixels 2–3 in x and y.
    const coarse = (hidden: boolean): GrayImage => {
      const data = new Uint8Array(16);
      if (hidden) data[1 * 4 + 1] = 255;
      return { width: 4, height: 4, data };
    };
    const frames = crowd(standing);
    const coarseMasks = [0, 1, 2, 3, 4].map((index) =>
      coarse(standing.includes(index)),
    );
    expect(backgroundAt(frames, coarseMasks, 2, 2)).toEqual([...SCENE]);
    expect(backgroundAt(crowd(standing), coarseMasks, 3, 3)).toEqual([
      ...SCENE,
    ]);
    // Pixel (4, 4) is outside cell (1, 1), so the person there stays.
    expect(backgroundAt(crowd(standing), coarseMasks, 4, 4)).toEqual([
      ...PERSON,
    ]);
  });

  it('counts a mask value of 128 as a person and 127 as not', () => {
    const level = (value: number): GrayImage => ({
      ...SIZE,
      data: new Uint8Array(64).fill(value),
    });
    const frames = (): AlignedFrame[] => crowd(standing);
    const asMasks = (value: number): GrayImage[] =>
      [0, 1, 2, 3, 4].map((index) =>
        standing.includes(index) ? level(value) : noOne,
      );
    expect(backgroundAt(frames(), asMasks(128), 3, 3)).toEqual([...SCENE]);
    expect(backgroundAt(frames(), asMasks(127), 3, 3)).toEqual([...PERSON]);
  });

  it('refuses a number of masks that is not the number of frames', () => {
    expect(() =>
      stackFrames(crowd(standing), { rect: RECT, hidden: [noOne] }),
    ).toThrow(RangeError);
  });
});
