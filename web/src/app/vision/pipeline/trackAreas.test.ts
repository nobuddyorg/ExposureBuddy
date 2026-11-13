import { describe, expect, it } from 'vitest';

import {
  MAX_STEP_SHARE,
  MIN_TRACKED_AREA,
  STANDING_SHARE,
  trackAreas,
} from './trackAreas';
import type { GrayImage } from '../types';

const SIZE = { width: 200, height: 100 };

interface Box {
  x: number;
  y: number;
  size?: number;
  height?: number;
}

function maskIn(
  frame: { width: number; height: number },
  ...boxes: Box[]
): GrayImage {
  const data = new Uint8Array(frame.width * frame.height);
  for (const { x, y, size = 10, height = size } of boxes)
    for (let dy = 0; dy < height; dy += 1)
      for (let dx = 0; dx < size; dx += 1)
        data[(y + dy) * frame.width + x + dx] = 255;
  return { ...frame, data };
}

const maskOf = (...boxes: Box[]) => maskIn(SIZE, ...boxes);

describe('trackAreas', () => {
  it('has nothing for no samples, and nothing for samples without movers', () => {
    expect(trackAreas([])).toEqual([]);
    expect(trackAreas([maskOf(), maskOf()])).toEqual([[], []]);
  });

  it('follows a mover from sample to sample and gives the last one the way back', () => {
    const [first, second, last] = trackAreas([
      maskOf({ x: 10, y: 40 }),
      maskOf({ x: 40, y: 40 }),
      maskOf({ x: 70, y: 40 }),
    ]);
    expect(first[0].step).toEqual({ x: 30, y: 0 });
    expect(second[0].step).toEqual({ x: 30, y: 0 });
    expect(last[0].step.x).toBe(-30);
    expect(Math.abs(last[0].step.y)).toBe(0);
    expect(first[0].standing).toBe(false);
    expect(first[0].centre).toEqual({ x: 14.5, y: 44.5 });
  });

  it('keeps two movers apart', () => {
    const [first] = trackAreas([
      maskOf({ x: 10, y: 10 }, { x: 10, y: 70 }),
      maskOf({ x: 30, y: 10 }, { x: 30, y: 70 }),
    ]);
    expect(first.map((area) => area.step)).toEqual([
      { x: 20, y: 0 },
      { x: 20, y: 0 },
    ]);
  });

  it('calls a mover that hardly moved standing', () => {
    const moved = Math.floor(STANDING_SHARE * SIZE.width) - 0;
    const [first] = trackAreas([
      maskOf({ x: 10, y: 40 }),
      maskOf({ x: 10 + moved, y: 40 }),
    ]);
    expect(first[0].standing).toBe(true);
  });

  it('does not match a mover that jumped farther than anybody travels, nor one of another size', () => {
    const jump = Math.ceil(MAX_STEP_SHARE * SIZE.width) + 5;
    const [far] = trackAreas([
      maskOf({ x: 10, y: 40 }),
      maskOf({ x: 10 + jump, y: 40 }),
    ]);
    expect(far[0]).toMatchObject({ step: { x: 0, y: 0 }, standing: false });
    const [grown] = trackAreas([
      maskOf({ x: 10, y: 40, size: 10 }),
      maskOf({ x: 12, y: 40, size: 20 }),
    ]);
    expect(grown[0].step).toEqual({ x: 0, y: 0 });
  });

  it('ignores specks', () => {
    const side = Math.floor(Math.sqrt(MIN_TRACKED_AREA)) - 1;
    expect(trackAreas([maskOf({ x: 10, y: 10, size: side })])).toEqual([[]]);
  });

  it('gives each target to the nearest mover only', () => {
    const [first] = trackAreas([
      maskOf({ x: 10, y: 40 }, { x: 22, y: 40 }),
      maskOf({ x: 30, y: 40 }),
    ]);
    const matched = first.filter((area) => area.step.x !== 0);
    expect(matched).toHaveLength(1);
    expect(matched[0].centre.x).toBeCloseTo(26.5);
  });

  it('tracks an area of exactly the smallest size', () => {
    const [areas] = trackAreas([
      maskOf({ x: 10, y: 10, size: 5, height: MIN_TRACKED_AREA / 5 }),
    ]);
    expect(areas.map((area) => area.pixels.length)).toEqual([MIN_TRACKED_AREA]);
  });

  it('does not match a mover that shrank to under a third', () => {
    const [shrunk] = trackAreas([
      maskOf({ x: 10, y: 40, size: 20 }),
      maskOf({ x: 12, y: 40, size: 10 }),
    ]);
    expect(shrunk[0].step).toEqual({ x: 0, y: 0 });
  });

  it('still matches a mover that grew or shrank to exactly three times or a third', () => {
    const tall = { x: 10, y: 40, size: 10, height: 30 };
    const small = { x: 20, y: 50, size: 10 };
    const [shrunk] = trackAreas([maskOf(tall), maskOf(small)]);
    expect(shrunk[0].step).toEqual({ x: 10, y: 0 });
    const [grown] = trackAreas([maskOf(small), maskOf(tall)]);
    expect(grown[0].step).toEqual({ x: -10, y: 0 });
  });

  it('still matches a mover that went exactly as far as anybody travels', () => {
    const farthest = MAX_STEP_SHARE * SIZE.width;
    const [first] = trackAreas([
      maskOf({ x: 10, y: 40 }),
      maskOf({ x: 10 + farthest, y: 40 }),
    ]);
    expect(first[0].step).toEqual({ x: farthest, y: 0 });
  });

  it('weighs the vertical distance like the horizontal one when finding the nearest mover', () => {
    // From the target, the mover below is 20 away and the one up left 36.
    const [first] = trackAreas([
      maskOf({ x: 65, y: 0 }, { x: 100, y: 30 }),
      maskOf({ x: 100, y: 10 }),
    ]);
    expect(first.map((area) => area.step)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: -20 },
    ]);
  });

  it('gives a target to the nearest mover even when a farther one comes first', () => {
    const [first] = trackAreas([
      maskOf({ x: 10, y: 10 }, { x: 60, y: 40 }),
      maskOf({ x: 70, y: 40 }, { x: 185, y: 85 }),
    ]);
    expect(first.map((area) => area.step)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('sends a mover to the nearest of two targets', () => {
    const [first] = trackAreas([
      maskOf({ x: 10, y: 40 }),
      maskOf({ x: 20, y: 40 }, { x: 50, y: 40 }),
    ]);
    expect(first[0].step).toEqual({ x: 10, y: 0 });
  });

  it('leaves a mover that is gone in the next sample without a way, unless it is the last sample', () => {
    const [, second] = trackAreas([
      maskOf({ x: 10, y: 40 }),
      maskOf({ x: 40, y: 40 }),
      maskOf(),
    ]);
    expect(second[0]).toMatchObject({ step: { x: 0, y: 0 }, standing: false });
  });

  it('gives the last sample the way back up as well as across', () => {
    const [, last] = trackAreas([
      maskOf({ x: 10, y: 10 }),
      maskOf({ x: 10, y: 40 }),
    ]);
    expect(last[0].step.y).toBe(-30);
  });

  it('does not call a mover standing that moved exactly the standing share', () => {
    const wide = { width: 500, height: 100 };
    const moved = STANDING_SHARE * wide.width;
    expect(moved).toBe(3);
    const [first] = trackAreas([
      maskIn(wide, { x: 10, y: 40 }),
      maskIn(wide, { x: 10 + moved, y: 40 }),
    ]);
    expect(first[0]).toMatchObject({ step: { x: 3, y: 0 }, standing: false });
  });
});
