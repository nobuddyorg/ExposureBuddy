import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { mulberry32, standardNormal } from './random';

function sequence(seed: number, length: number): number[] {
  const next = mulberry32(seed);
  return Array.from({ length }, () => next());
}

describe('mulberry32', () => {
  it('replays the same sequence for the same seed', () => {
    expect(sequence(42, 20)).toEqual(sequence(42, 20));
  });

  it('is the reference mulberry32 stream, so a seed means the same draws everywhere', () => {
    const [first, second, third] = sequence(1, 3);
    expect(first).toBeCloseTo(0.627073940588, 12);
    expect(second).toBeCloseTo(0.00273572118, 12);
    expect(third).toBeCloseTo(0.52744703996, 12);
  });

  it('differs between seeds', () => {
    expect(sequence(1, 5)).not.toEqual(sequence(2, 5));
  });

  it('stays in [0, 1) for any seed', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        for (const value of sequence(seed, 50)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
    );
  });

  it('is roughly uniform: mean near 0.5 with values in every quarter', () => {
    const values = sequence(7, 4000);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.02);
    for (let quarter = 0; quarter < 4; quarter += 1) {
      const share =
        values.filter((value) => Math.floor(value * 4) === quarter).length /
        values.length;
      expect(Math.abs(share - 0.25)).toBeLessThan(0.03);
    }
  });
});

describe('standardNormal', () => {
  it('has mean ≈ 0 and standard deviation ≈ 1 over many samples', () => {
    const next = mulberry32(99);
    const samples = Array.from({ length: 8000 }, () => standardNormal(next));
    const mean =
      samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance =
      samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.05);
  });

  it('never produces an infinite value even when the uniform source yields 0', () => {
    expect(Number.isFinite(standardNormal(() => 0))).toBe(true);
  });
});
