import { describe, expect, it } from 'vitest';

import { featureSize, liquidOffset, smokeDrift, smokeKeep } from './shapes';

describe('featureSize', () => {
  it('is the long edge over the divisor, and never less than the minimum', () => {
    expect(featureSize(1000, 25, 8)).toBe(40);
    expect(featureSize(100, 25, 8)).toBe(8);
    expect(featureSize(70, 70, 4)).toBe(4);
    expect(featureSize(700, 70, 4)).toBe(10);
  });
});

describe('liquidOffset', () => {
  it('is centred on no movement and reaches half of reach each way', () => {
    expect(liquidOffset(40, 0.5, 0.5)).toEqual({ x: 0, y: 0 });
    expect(liquidOffset(40, 1, 0)).toEqual({ x: 20, y: -20 });
    expect(liquidOffset(40, 0.25, 0.75)).toEqual({ x: -10, y: 10 });
  });

  it('keeps the two axes apart', () => {
    expect(liquidOffset(10, 1, 0.5)).toEqual({ x: 5, y: 0 });
    expect(liquidOffset(10, 0.5, 1)).toEqual({ x: 0, y: 5 });
  });
});

describe('smokeDrift', () => {
  it('drifts sideways by up to an eighth of reach either way, and only ever upwards in y', () => {
    expect(smokeDrift(80, 0.5, 0)).toEqual({ x: 0, y: 0 });
    expect(smokeDrift(80, 1, 1)).toEqual({ x: 10, y: 16 });
    expect(smokeDrift(80, 0, 0.5)).toEqual({ x: -10, y: 8 });
  });
});

describe('smokeKeep', () => {
  it('keeps everything at strength 0, whatever the noise', () => {
    expect(smokeKeep(0, 0)).toBe(1);
    expect(smokeKeep(0, 0.3)).toBe(1);
  });

  it('thins the whole cloud by 40 % at full strength and tears out where the noise is 0', () => {
    expect(smokeKeep(1, 1)).toBeCloseTo(0.6, 12);
    expect(smokeKeep(1, 0)).toBe(0);
    expect(smokeKeep(0.5, 1)).toBeCloseTo(0.8, 12);
    expect(smokeKeep(0.5, 0)).toBeCloseTo(0.4, 12);
    expect(smokeKeep(0.5, 0.5)).toBeCloseTo(0.75 * 0.8, 12);
  });
});
