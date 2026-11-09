import { describe, expect, it } from 'vitest';

import {
  rectMask,
  solidImage,
  withRect,
} from '../effects/effects.test-support';
import { BURST_BLUR } from '../effects/effectParams';
import { prepareScene, renderScene } from '../effects/render';
import {
  addBlurredFrame,
  averageOf,
  emptySum,
  MAX_BLURRED_FRAMES,
} from './blurMovers';

const SIZE = { width: 60, height: 40 };
const PERSON = { x: 20, y: 10, width: 10, height: 20 };
const photo = withRect(
  solidImage(SIZE.width, SIZE.height, [90, 90, 90]),
  PERSON,
  [250, 0, 0],
);

describe('blurMovers', () => {
  it('gives a frame without movers back as it is', () => {
    const sum = emptySum(SIZE);
    addBlurredFrame(
      sum,
      {
        image: photo,
        mask: rectMask(SIZE.width, SIZE.height, {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        }),
      },
      BURST_BLUR,
    );
    expect([...averageOf(sum, 1, SIZE).data]).toEqual([...photo.data]);
  });

  it('blurs the movers and leaves the rest of the frame as it was', () => {
    const sum = emptySum(SIZE);
    addBlurredFrame(
      sum,
      { image: photo, mask: rectMask(SIZE.width, SIZE.height, PERSON) },
      BURST_BLUR,
    );
    const result = averageOf(sum, 1, SIZE);
    const at = (x: number, y: number) => [
      ...result.data.subarray(
        (y * SIZE.width + x) * 4,
        (y * SIZE.width + x) * 4 + 3,
      ),
    ];
    expect(at(2, 2)).toEqual([90, 90, 90]);
    expect(at(25, 20)).not.toEqual([250, 0, 0]);
  });

  it('averages frames: the same frame twice is the same image, two different ones are their mean', () => {
    const mask = rectMask(SIZE.width, SIZE.height, PERSON);
    const once = emptySum(SIZE);
    addBlurredFrame(once, { image: photo, mask }, BURST_BLUR);
    const twice = emptySum(SIZE);
    addBlurredFrame(twice, { image: photo, mask }, BURST_BLUR);
    addBlurredFrame(twice, { image: photo, mask }, BURST_BLUR);
    expect([...averageOf(twice, 2, SIZE).data]).toEqual([
      ...averageOf(once, 1, SIZE).data,
    ]);

    const dark = solidImage(SIZE.width, SIZE.height, [10, 10, 10]);
    const none = rectMask(SIZE.width, SIZE.height, {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    const mixed = emptySum(SIZE);
    addBlurredFrame(mixed, { image: dark, mask: none }, BURST_BLUR);
    addBlurredFrame(
      mixed,
      { image: solidImage(SIZE.width, SIZE.height, [30, 50, 70]), mask: none },
      BURST_BLUR,
    );
    expect([...averageOf(mixed, 2, SIZE).data.subarray(0, 4)]).toEqual([
      20, 30, 40, 255,
    ]);
  });

  it('stretches a coarse mask over a larger frame, so it covers the same part of the picture', () => {
    const coarse = rectMask(30, 20, { x: 10, y: 5, width: 5, height: 10 });
    const sum = emptySum(SIZE);
    addBlurredFrame(sum, { image: photo, mask: coarse }, BURST_BLUR);
    const direct = emptySum(SIZE);
    addBlurredFrame(
      direct,
      { image: photo, mask: rectMask(SIZE.width, SIZE.height, PERSON) },
      BURST_BLUR,
    );
    const a = averageOf(sum, 1, SIZE).data;
    const b = averageOf(direct, 1, SIZE).data;
    // The same picture up to the soft edge the stretching adds: most pixels are equal.
    const equal = a.filter(
      (value, index) => Math.abs(value - b[index]) <= 12,
    ).length;
    expect(equal / a.length).toBeGreaterThan(0.9);
  });

  it('renders the same as the single-photo effect does, which it reuses', () => {
    const mask = rectMask(SIZE.width, SIZE.height, PERSON);
    const scene = prepareScene(photo, mask);
    if (!scene) throw new Error('no scene');
    const expected = renderScene(scene, BURST_BLUR);
    const sum = emptySum(SIZE);
    addBlurredFrame(sum, { image: photo, mask }, BURST_BLUR);
    expect([...averageOf(sum, 1, SIZE).data]).toEqual([...expected.data]);
  });

  it('names the look and how many frames get it', () => {
    expect(BURST_BLUR.effect).toBe('motion');
    expect(MAX_BLURRED_FRAMES).toBe(6);
  });
});
