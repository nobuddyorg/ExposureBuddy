import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type {
  BandedRgb,
  CompositeParams,
  Rect,
  RgbaImage,
  Size,
  StackResult,
} from '../types';
import { composite } from './composite';
import {
  allPixels,
  flatFrame,
  paintRect,
  stackFrames,
  type Rgb,
} from './synthetic.test-support';

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
  return stackFrames(frames, { rect: FULL });
}

function rgbOf(data: Uint8ClampedArray, pixel: number): number[] {
  return Array.from(data.subarray(pixel * 4, pixel * 4 + 3));
}

/** The RGB of every pixel of `image`, alpha dropped, in the order allPixels lists a banded image. */
function rgbPixels(image: RgbaImage): number[] {
  return Array.from(image.data).filter((_, index) => index % 4 !== 3);
}

function layerRgb(layer: BandedRgb, pixel: number): number[] {
  return allPixels(layer).slice(pixel * 3, pixel * 3 + 3);
}

function params(overrides: Partial<CompositeParams>): CompositeParams {
  return {
    background: 'median',
    ghostStrength: 0,
    ghostBlur: 0,
    glow: 0,
    trails: false,
    ...overrides,
  };
}

function isOpaque(image: RgbaImage): boolean {
  return image.data.every((value, index) => index % 4 !== 3 || value === 255);
}

describe('composite', () => {
  const stack = sceneStack();
  const pixelCount = SIZE.width * SIZE.height;

  it('is exactly the median with no ghost and no glow, opaque and stack-sized', () => {
    const image = composite(stack, params({ ghostBlur: 5 }));
    expect(image.width).toBe(SIZE.width);
    expect(image.height).toBe(SIZE.height);
    expect(rgbPixels(image)).toEqual(allPixels(stack.backgrounds.median));
    expect(isOpaque(image)).toBe(true);
  });

  it('is exactly the mean at full ghost strength without blur or glow', () => {
    const image = composite(stack, params({ ghostStrength: 1 }));
    expect(rgbPixels(image)).toEqual(allPixels(stack.mean));
  });

  it('is exactly the chosen background with no ghost and no glow', () => {
    for (const background of ['trimmed', 'clipped', 'mode'] as const) {
      const image = composite(stack, params({ background }));
      expect(rgbPixels(image)).toEqual(
        allPixels(stack.backgrounds[background]),
      );
    }
  });

  it('measures the ghost against the chosen background', () => {
    const pixel = BRIGHT_RECT.y * SIZE.width + BRIGHT_RECT.x;
    const base = layerRgb(stack.backgrounds.trimmed, pixel);
    const mean = layerRgb(stack.mean, pixel);
    const image = composite(
      stack,
      params({ background: 'trimmed', ghostStrength: 1 }),
    );
    expect(rgbOf(image.data, pixel)).toEqual(
      mean.map((value, channel) =>
        Math.round(base[channel] + (value - base[channel])),
      ),
    );
  });

  it('adds glow only where the mean is above the median', () => {
    const plain = composite(stack, params({ ghostStrength: 0.5 }));
    const glowing = composite(stack, params({ ghostStrength: 0.5, glow: 1 }));
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
    const sharp = composite(stack, params({ ghostStrength: 1 }));
    const blurred = composite(
      stack,
      params({ ghostStrength: 1, ghostBlur: 1 }),
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

  it('spreads the glow well beyond the block with the ghost blur widened', () => {
    const plain = composite(stack, params({ ghostBlur: 3 }));
    const glowing = composite(stack, params({ ghostBlur: 3, glow: 1 }));
    const besideBlock =
      (BRIGHT_RECT.y + 1) * SIZE.width + BRIGHT_RECT.x + BRIGHT_RECT.width + 2;
    expect(rgbOf(glowing.data, besideBlock)[0]).toBeGreaterThan(
      rgbOf(plain.data, besideBlock)[0],
    );
  });

  it('adds glow to the channel whose mean exceeds the median, not to the others', () => {
    const frames = [
      flatFrame(SIZE, BACKGROUND),
      flatFrame(SIZE, BACKGROUND),
      flatFrame(SIZE, BACKGROUND),
    ];
    paintRect(frames[1].image, BRIGHT_RECT, [
      BACKGROUND[0],
      BACKGROUND[1],
      250,
    ]);
    const blueGhost = stackFrames(frames, { rect: FULL });
    const glowing = composite(blueGhost, params({ glow: 1 }));
    let brightened = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const [red, green, blue] = rgbOf(glowing.data, pixel);
      expect([red, green]).toEqual([BACKGROUND[0], BACKGROUND[1]]);
      expect(blue).toBeGreaterThanOrEqual(BACKGROUND[2]);
      if (blue > BACKGROUND[2]) brightened += 1;
    }
    expect(brightened).toBeGreaterThan(0);
  });

  it('blurs each channel over the whole image when it spans several bands', () => {
    const tall = { width: 3, height: 150 };
    const frames = [
      flatFrame(tall, BACKGROUND),
      flatFrame(tall, BACKGROUND),
      flatFrame(tall, BACKGROUND),
    ];
    paintRect(frames[0].image, { x: 1, y: 64, width: 1, height: 1 }, BRIGHT);
    const result = stackFrames(frames, { rect: { x: 0, y: 0, ...tall } });
    const image = composite(result, params({ ghostStrength: 1, ghostBlur: 1 }));
    // The ghost sits on the first row of the second band; the blur carries it into both bands, in every channel.
    for (const y of [63, 65]) {
      const pixel = y * tall.width + 1;
      rgbOf(image.data, pixel).forEach((value, channel) =>
        expect(value).toBeGreaterThan(BACKGROUND[channel]),
      );
    }
    expect(rgbOf(image.data, 20 * tall.width + 1)).toEqual([...BACKGROUND]);
  });

  it('is exactly the brightest value at full strength with light trails, without blur or glow', () => {
    const image = composite(stack, params({ ghostStrength: 1, trails: true }));
    expect(rgbPixels(image)).toEqual(allPixels(stack.brightest));
    // The dark block never raised the brightest value, so light trails keep the scene there.
    const darkCenter = (DARK_RECT.y + 1) * SIZE.width + DARK_RECT.x + 1;
    expect(rgbOf(image.data, darkCenter)).toEqual([...BACKGROUND]);
    expect(
      rgbOf(image.data, BRIGHT_RECT.y * SIZE.width + BRIGHT_RECT.x),
    ).toEqual([...BRIGHT]);
  });

  it('composites a stack exactly one band tall', () => {
    const band = { width: 2, height: 64 };
    const frames = [flatFrame(band, BACKGROUND), flatFrame(band, BRIGHT)];
    const result = stackFrames(frames, { rect: { x: 0, y: 0, ...band } });
    const image = composite(result, params({ ghostStrength: 1 }));
    expect(rgbPixels(image)).toEqual(allPixels(result.mean));
  });

  it('matches the documented formula on a uniform ghost for any strength, blur and glow', () => {
    // A blur leaves a uniform layer unchanged, so the formula holds exactly whatever the radius.
    const frames = [
      flatFrame(SIZE, BACKGROUND),
      flatFrame(SIZE, BACKGROUND),
      flatFrame(SIZE, BRIGHT),
    ];
    const uniform = stackFrames(frames, { rect: FULL });
    const median = allPixels(uniform.backgrounds.median);
    const mean = allPixels(uniform.mean);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 4 }),
        (ghostStrength, glow, ghostBlur) => {
          const image = composite(uniform, {
            background: 'median',
            ghostStrength,
            ghostBlur,
            glow,
            trails: false,
          });
          expect(isOpaque(image)).toBe(true);
          rgbPixels(image).forEach((value, index) => {
            const ghost = mean[index] - median[index];
            expect(ghost).toBeGreaterThan(0);
            expect(value).toBe(
              Math.round(
                median[index] + ghostStrength * ghost + glow * 1.5 * ghost,
              ),
            );
          });
        },
      ),
      { numRuns: 30 },
    );
  });

  it('matches the per-pixel formula without blur or glow for any ghost strength', () => {
    const median = allPixels(stack.backgrounds.median);
    const mean = allPixels(stack.mean);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        (ghostStrength) => {
          const image = composite(stack, params({ ghostStrength }));
          expect(isOpaque(image)).toBe(true);
          rgbPixels(image).forEach((value, index) => {
            const ghost = mean[index] - median[index];
            const expected = Math.round(median[index] + ghostStrength * ghost);
            expect(value).toBe(Math.min(255, Math.max(0, expected)));
          });
        },
      ),
    );
  });
});
