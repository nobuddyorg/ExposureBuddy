import { describe, expect, it } from 'vitest';

import {
  MAX_STEP_SHARE,
  MIN_TRACKED_AREA,
  STANDING_SHARE,
  trackAreas,
} from './trackAreas';
import type { GrayImage } from '../types';

const SIZE = { width: 200, height: 100 };

function maskOf(
  ...boxes: { x: number; y: number; size?: number }[]
): GrayImage {
  const data = new Uint8Array(SIZE.width * SIZE.height);
  for (const { x, y, size = 10 } of boxes)
    for (let dy = 0; dy < size; dy += 1)
      for (let dx = 0; dx < size; dx += 1)
        data[(y + dy) * SIZE.width + x + dx] = 255;
  return { ...SIZE, data };
}

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
});
