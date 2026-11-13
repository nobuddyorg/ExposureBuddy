import { describe, expect, it } from 'vitest';

import type { Rgb } from './synthetic.test-support';
import { flatFrame, stackFrames } from './synthetic.test-support';

const SIZE = { width: 16, height: 8 };
const RECT = { x: 0, y: 0, ...SIZE };

// Green deviates from its median 20 by 10, 0 and 20 (MAD 10); red by 100, 0, 100 (MAD 100); blue not at all.
const COLOURS: Rgb[] = [
  [0, 10, 50],
  [100, 20, 50],
  [200, 40, 50],
];

function noiseOf(colours: readonly Rgb[]): Uint32Array {
  const noise = new Uint32Array(256);
  stackFrames(
    colours.map((colour) => flatFrame(SIZE, colour)),
    { rect: RECT, noise },
  );
  return noise;
}

const nonEmptyLevels = (noise: Uint32Array): number[][] =>
  [...noise.entries()]
    .filter(([, count]) => count > 0)
    .map(([level, count]) => [level, count]);

describe('stackRows noise histogram', () => {
  it('counts the median absolute deviation of the green channel, one pixel in every 8 × 4 block', () => {
    // 16 × 8 pixels hold four 8 × 4 blocks, so four samples, all at the green MAD of 10.
    expect(nonEmptyLevels(noiseOf(COLOURS))).toEqual([[10, 4]]);
  });

  it('counts a still burst at level 0', () => {
    expect(nonEmptyLevels(noiseOf([COLOURS[1], COLOURS[1]]))).toEqual([[0, 4]]);
  });

  it('adds to the counts it is given, so strips accumulate', () => {
    const noise = noiseOf(COLOURS);
    stackFrames(
      COLOURS.map((colour) => flatFrame(SIZE, colour)),
      { rect: RECT, noise },
    );
    expect(nonEmptyLevels(noise)).toEqual([[10, 8]]);
  });
});
