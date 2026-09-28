import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { CompositeParams, Rect, Size, StackResult } from '../types';
import {
  DEFAULT_COMPOSITE_PARAMS,
  clampCompositeParams,
  composite,
} from './composite';
import { stackFrames } from './stack';
import { flatFrame, paintRect, type Rgb } from './synthetic.test-support';

const SIZE: Size = { width: 24, height: 16 };
const FULL: Rect = { x: 0, y: 0, ...SIZE };
const BACKGROUND: Rgb = [60, 100, 140];
const BRIGHT: Rgb = [250, 220, 200];
const DARK: Rgb = [0, 10, 20];
const BRIGHT_RECT: Rect = { x: 2, y: 2, width: 4, height: 4 };
const DARK_RECT: Rect = { x: 16, y: 9, width: 4, height: 4 };

// Three frames: a bright block in one, a dark block in another, so the ghost has both signs.
function sceneStack(): StackResult {
  const frames = [
    flatFrame(SIZE, BACKGROUND),
    flatFrame(SIZE, BACKGROUND),
    flatFrame(SIZE, BACKGROUND),
  ];
  paintRect(frames[0].image, BRIGHT_RECT, BRIGHT);
  paintRect(frames[2].image, DARK_RECT, DARK);
  return stackFrames(frames);
}

function rgbOf(data: Uint8ClampedArray, pixel: number): number[] {
  return Array.from(data.subarray(pixel * 4, pixel * 4 + 3));
}

function params(overrides: Partial<CompositeParams>): CompositeParams {
  return { ghostStrength: 0, ghostBlur: 0, glow: 0, ...overrides };
}

describe('composite', () => {
  const stack = sceneStack();
  const pixelCount = SIZE.width * SIZE.height;

  it('is exactly the median with no ghost and no glow, opaque', () => {
    const image = composite(stack, params({ ghostBlur: 5 }), FULL);
    expect(image.width).toBe(SIZE.width);
    expect(image.height).toBe(SIZE.height);
    expect(image.data).toEqual(stack.median);
  });

  it('is exactly the mean at full ghost strength without blur or glow', () => {
    const image = composite(stack, params({ ghostStrength: 1 }), FULL);
    expect(image.data).toEqual(stack.mean);
  });

  it('adds glow only where the mean is above the median', () => {
    const plain = composite(stack, params({ ghostStrength: 0.5 }), FULL);
    const glowing = composite(
      stack,
      params({ ghostStrength: 0.5, glow: 1 }),
      FULL,
    );
    let brightened = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const before = rgbOf(plain.data, pixel);
      const after = rgbOf(glowing.data, pixel);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(after[channel]).toBeGreaterThanOrEqual(before[channel]);
        if (after[channel] > before[channel]) brightened += 1;
      }
    }
    expect(brightened).toBeGreaterThan(0);
    // The glow blur (radius 6) does not reach the dark block on the far side, whose ghost is negative.
    const darkCenter = (DARK_RECT.y + 1) * SIZE.width + DARK_RECT.x + 1;
    expect(rgbOf(glowing.data, darkCenter)).toEqual(
      rgbOf(plain.data, darkCenter),
    );
  });

  it('smears the ghost outside the block when blurred, keeping its total', () => {
    const sharp = composite(stack, params({ ghostStrength: 1 }), FULL);
    const blurred = composite(
      stack,
      params({ ghostStrength: 1, ghostBlur: 1 }),
      FULL,
    );
    const nextToBlock =
      (BRIGHT_RECT.y + 1) * SIZE.width + BRIGHT_RECT.x + BRIGHT_RECT.width;
    expect(rgbOf(blurred.data, nextToBlock)[0]).toBeGreaterThan(
      rgbOf(sharp.data, nextToBlock)[0],
    );
    const inBlock = (BRIGHT_RECT.y + 1) * SIZE.width + BRIGHT_RECT.x + 1;
    expect(rgbOf(blurred.data, inBlock)[0]).toBeLessThan(
      rgbOf(sharp.data, inBlock)[0],
    );
    let sharpTotal = 0;
    let blurredTotal = 0;
    for (let index = 0; index < sharp.data.length; index += 4) {
      sharpTotal += sharp.data[index];
      blurredTotal += blurred.data[index];
    }
    expect(Math.abs(sharpTotal - blurredTotal)).toBeLessThan(pixelCount);
  });

  it('reads the right pixels for an offset rect', () => {
    const rect: Rect = { x: 5, y: 3, width: 10, height: 7 };
    const image = composite(stack, params({ ghostStrength: 1 }), rect);
    expect(image.width).toBe(rect.width);
    expect(image.height).toBe(rect.height);
    for (let row = 0; row < rect.height; row += 1) {
      for (let x = 0; x < rect.width; x += 1) {
        const sourcePixel = (rect.y + row) * SIZE.width + rect.x + x;
        expect(rgbOf(image.data, row * rect.width + x)).toEqual(
          rgbOf(stack.mean, sourcePixel),
        );
        expect(image.data[(row * rect.width + x) * 4 + 3]).toBe(255);
      }
    }
  });

  it('matches the per-pixel formula without blur or glow for any ghost strength', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        (ghostStrength) => {
          const image = composite(stack, params({ ghostStrength }), FULL);
          for (let index = 0; index < image.data.length; index += 1) {
            if (index % 4 === 3) {
              expect(image.data[index]).toBe(255);
              continue;
            }
            const ghost = stack.mean[index] - stack.median[index];
            const expected = Math.round(
              stack.median[index] + ghostStrength * ghost,
            );
            expect(image.data[index]).toBe(
              Math.min(255, Math.max(0, expected)),
            );
          }
        },
      ),
    );
  });
});

describe('clampCompositeParams', () => {
  it('keeps values already in range', () => {
    expect(clampCompositeParams(DEFAULT_COMPOSITE_PARAMS)).toEqual(
      DEFAULT_COMPOSITE_PARAMS,
    );
    const edge = { ghostStrength: 1, ghostBlur: 32, glow: 0 };
    expect(clampCompositeParams(edge)).toEqual(edge);
  });

  it('clamps strength and glow to [0, 1] and the blur to [0, 32]', () => {
    expect(
      clampCompositeParams({ ghostStrength: 1.5, ghostBlur: 40, glow: -1 }),
    ).toEqual({
      ghostStrength: 1,
      ghostBlur: 32,
      glow: 0,
    });
    expect(
      clampCompositeParams({ ghostStrength: -0.2, ghostBlur: -3, glow: 7 }),
    ).toEqual({
      ghostStrength: 0,
      ghostBlur: 0,
      glow: 1,
    });
  });

  it('replaces NaN with the default, field by field', () => {
    expect(
      clampCompositeParams({ ghostStrength: NaN, ghostBlur: NaN, glow: NaN }),
    ).toEqual(DEFAULT_COMPOSITE_PARAMS);
    expect(
      clampCompositeParams({ ghostStrength: NaN, ghostBlur: 2, glow: 0.1 }),
    ).toEqual({
      ghostStrength: DEFAULT_COMPOSITE_PARAMS.ghostStrength,
      ghostBlur: 2,
      glow: 0.1,
    });
  });
});
