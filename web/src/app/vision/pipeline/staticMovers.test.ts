import { describe, expect, it } from 'vitest';

import {
  rectMask,
  solidImage,
  withRect,
} from '../effects/effects.test-support';
import {
  MIN_JUDGED_AREA,
  STATIC_LEVEL,
  STATUE_LEVEL,
  standingAreas,
  temporalDeviation,
  withoutStaticAreas,
} from './staticMovers';

const W = 60;
const H = 40;
const STATUE = { x: 2, y: 2, width: 16, height: 16 };
const WALKER_AT = (frame: number) => ({
  x: 20 + frame * 3,
  y: 15,
  width: 10,
  height: 12,
});

/** Five frames of one scene: a statue that never changes and a walker whose colour and place change. */
const frames = Array.from({ length: 5 }, (_, frame) =>
  withRect(
    withRect(solidImage(W, H, [100, 100, 100]), STATUE, [200, 180, 160]),
    WALKER_AT(frame),
    [40 + frame * 40, 0, 0],
  ),
);

describe('temporalDeviation', () => {
  it('is 0 where the frames agree and large where one differs', () => {
    const deviation = temporalDeviation(frames);
    expect(deviation[5 * W + 5]).toBe(0);
    expect(deviation[20 * W + 25]).toBeGreaterThan(20);
  });

  it('is the mean distance from the median over frames and channels', () => {
    const three = [10, 10, 40].map((value) =>
      solidImage(1, 1, [value, value, value]),
    );
    // Median 10; the distances are 0, 0 and 30: a mean of 10.
    expect(temporalDeviation(three)[0]).toBeCloseTo(10, 5);
  });

  it('is empty for no frames', () => {
    expect(temporalDeviation([]).length).toBe(0);
  });
});

describe('withoutStaticAreas', () => {
  const deviation = temporalDeviation(frames);

  it('drops an area that does not change between the frames', () => {
    const kept = withoutStaticAreas(rectMask(W, H, STATUE), deviation);
    expect(kept.data.every((value) => value === 0)).toBe(true);
  });

  it('keeps an area whose pixels change', () => {
    const mask = rectMask(W, H, { x: 20, y: 15, width: 22, height: 12 });
    const kept = withoutStaticAreas(mask, deviation);
    expect([...kept.data]).toEqual([...mask.data]);
  });

  it('judges each area on its own: the statue goes, the walker stays, in one mask', () => {
    const both = rectMask(W, H, STATUE);
    rectMask(W, H, { x: 20, y: 15, width: 20, height: 12 }).data.forEach(
      (value, pixel) => {
        if (value > 0) both.data[pixel] = 255;
      },
    );
    const kept = withoutStaticAreas(both, deviation);
    expect(kept.data[5 * W + 5]).toBe(0);
    expect(kept.data[20 * W + 25]).toBe(255);
  });

  it('leaves areas too small to judge', () => {
    const tiny = rectMask(W, H, { x: 2, y: 2, width: 4, height: 4 });
    expect(4 * 4).toBeLessThan(MIN_JUDGED_AREA);
    expect([...withoutStaticAreas(tiny, deviation).data]).toEqual([
      ...tiny.data,
    ]);
  });

  it('judges an area of exactly the minimum size', () => {
    const exact = rectMask(W, H, { x: 2, y: 2, width: 20, height: 10 });
    expect(20 * 10).toBe(MIN_JUDGED_AREA);
    expect(
      withoutStaticAreas(exact, deviation).data.every((value) => value === 0),
    ).toBe(true);
  });

  it('keeps an area exactly at the level and drops one just under it', () => {
    const level = new Float32Array(W * H).fill(STATIC_LEVEL);
    const mask = rectMask(W, H, STATUE);
    expect([...withoutStaticAreas(mask, level).data]).toEqual([...mask.data]);
    const under = new Float32Array(W * H).fill(STATIC_LEVEL - 0.5);
    expect(
      withoutStaticAreas(mask, under).data.every((value) => value === 0),
    ).toBe(true);
  });

  it('takes the level as a parameter', () => {
    const mask = rectMask(W, H, STATUE);
    const some = new Float32Array(W * H).fill(10);
    expect([...withoutStaticAreas(mask, some, 5).data]).toEqual([...mask.data]);
    expect(
      withoutStaticAreas(mask, some, 11).data.every((value) => value === 0),
    ).toBe(true);
  });

  it('does not change the mask it was given', () => {
    const mask = rectMask(W, H, STATUE);
    const before = [...mask.data];
    withoutStaticAreas(mask, deviation);
    expect([...mask.data]).toEqual(before);
  });

  it('counts only 4-connected pixels as one area: two blocks that touch at a corner are two', () => {
    const mask = rectMask(W, H, { x: 2, y: 2, width: 12, height: 12 });
    rectMask(W, H, { x: 14, y: 14, width: 12, height: 12 }).data.forEach(
      (value, pixel) => {
        if (value > 0) mask.data[pixel] = 255;
      },
    );
    // 144 pixels each: too small to be judged alone, but 288 if they were one area, and the statue's deviation would drop them.
    expect([...withoutStaticAreas(mask, deviation).data]).toEqual([
      ...mask.data,
    ]);
  });

  it('follows an area to every edge of the frame without leaving it', () => {
    const everything = rectMask(W, H, { x: 0, y: 0, width: W, height: H });
    const high = new Float32Array(W * H).fill(100);
    expect([...withoutStaticAreas(everything, high).data]).toEqual([
      ...everything.data,
    ]);
    const flat = new Float32Array(W * H);
    expect(
      withoutStaticAreas(everything, flat).data.every((value) => value === 0),
    ).toBe(true);
  });
});

describe('standingAreas', () => {
  const BOX = { x: 5, y: 5, width: 20, height: 12 };
  const levelled = (level: number) => new Float32Array(W * H).fill(level);
  const none = () => new Uint8Array(W * H);

  it('takes an area that is still but livelier than a statue', () => {
    const mask = rectMask(W, H, BOX);
    expect([...standingAreas(mask, levelled(16)).data]).toEqual([...mask.data]);
  });

  it('leaves a statue, a mover, and an area too small to judge', () => {
    const mask = rectMask(W, H, BOX);
    expect([...standingAreas(mask, levelled(10)).data]).toEqual([...none()]);
    expect([...standingAreas(mask, levelled(20)).data]).toEqual([...none()]);
    const tiny = rectMask(W, H, { x: 2, y: 2, width: 4, height: 4 });
    expect([...standingAreas(tiny, levelled(16)).data]).toEqual([...none()]);
  });

  it('draws the line at the statue level, inclusive, and below the static level', () => {
    const mask = rectMask(W, H, BOX);
    const kept = (level: number) =>
      standingAreas(mask, levelled(level)).data.some((value) => value > 0);
    expect(kept(STATUE_LEVEL - 0.1)).toBe(false);
    expect(kept(STATUE_LEVEL)).toBe(true);
    expect(kept(STATIC_LEVEL - 0.1)).toBe(true);
    expect(kept(STATIC_LEVEL)).toBe(false);
  });
});
