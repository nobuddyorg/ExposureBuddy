import { describe, expect, it } from 'vitest';

import { composeOver, emptyLayer, liftLayer, mixByMask } from './layer';
import { grayOf, pixelOf, solidImage } from './effects.test-support';

describe('liftLayer', () => {
  it('premultiplies the colour by the coverage and keeps the coverage as alpha', () => {
    const layer = liftLayer(
      solidImage(2, 1, [200, 100, 50]),
      grayOf(2, 1, [255, 51]),
    );
    expect(Array.from(layer.data)).toEqual([200, 100, 50, 255, 40, 20, 10, 51]);
  });
});

describe('composeOver', () => {
  const plate = solidImage(3, 1, [10, 20, 30]);
  const region = { x: 0, y: 0, width: 3, height: 1 };

  it('shows the plate where the layer is empty', () => {
    expect(pixelOf(composeOver(plate, emptyLayer(3, 1), region), 1, 0)).toEqual(
      [10, 20, 30, 255],
    );
  });

  it('shows the layer where it is opaque', () => {
    const layer = liftLayer(
      solidImage(3, 1, [200, 100, 50]),
      grayOf(3, 1, [255, 255, 255]),
    );
    expect(pixelOf(composeOver(plate, layer, region), 2, 0)).toEqual([
      200, 100, 50, 255,
    ]);
  });

  it('adds the plate behind a half transparent layer', () => {
    const layer = liftLayer(
      solidImage(3, 1, [200, 100, 50]),
      grayOf(3, 1, [0, 128, 0]),
    );
    const [r, g, b, a] = pixelOf(composeOver(plate, layer, region), 1, 0);
    expect([r, g, b, a]).toEqual([
      Math.round(200 * (128 / 255) + 10 * (127 / 255)),
      Math.round(100 * (128 / 255) + 20 * (127 / 255)),
      Math.round(50 * (128 / 255) + 30 * (127 / 255)),
      255,
    ]);
  });

  it('leaves everything outside the region as the plate has it, and does not change the plate', () => {
    const layer = liftLayer(
      solidImage(3, 1, [200, 100, 50]),
      grayOf(3, 1, [255, 255, 255]),
    );
    const composed = composeOver(plate, layer, {
      x: 1,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(pixelOf(composed, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelOf(composed, 1, 0)).toEqual([200, 100, 50, 255]);
    expect(pixelOf(composed, 2, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelOf(plate, 1, 0)).toEqual([10, 20, 30, 255]);
  });

  it('works in a region that does not start at the corner', () => {
    const image = solidImage(4, 3, [0, 0, 0]);
    const layer = liftLayer(
      solidImage(4, 3, [90, 90, 90]),
      grayOf(4, 3, new Array(12).fill(255)),
    );
    const composed = composeOver(image, layer, {
      x: 2,
      y: 1,
      width: 2,
      height: 1,
    });
    expect(pixelOf(composed, 2, 1)).toEqual([90, 90, 90, 255]);
    expect(pixelOf(composed, 1, 1)).toEqual([0, 0, 0, 255]);
    expect(pixelOf(composed, 2, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelOf(composed, 2, 2)).toEqual([0, 0, 0, 255]);
  });
});

describe('mixByMask over a square image', () => {
  it('mixes every pixel, with the weights of both images', () => {
    const from = solidImage(2, 2, [100, 100, 100]);
    const to = solidImage(2, 2, [200, 0, 0]);
    const mixed = mixByMask(from, to, grayOf(2, 2, [0, 255, 255, 51]));
    expect(pixelOf(mixed, 0, 0)).toEqual([100, 100, 100, 255]);
    expect(pixelOf(mixed, 1, 0)).toEqual([200, 0, 0, 255]);
    expect(pixelOf(mixed, 0, 1)).toEqual([200, 0, 0, 255]);
    expect(pixelOf(mixed, 1, 1)).toEqual([120, 80, 80, 255]);
  });
});

describe('mixByMask', () => {
  const from = solidImage(3, 1, [0, 0, 0]);
  const to = solidImage(3, 1, [200, 100, 50]);

  it('takes `from` at 0, `to` at 255 and the blend between', () => {
    const mixed = mixByMask(from, to, grayOf(3, 1, [0, 255, 51]));
    expect(pixelOf(mixed, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelOf(mixed, 1, 0)).toEqual([200, 100, 50, 255]);
    expect(pixelOf(mixed, 2, 0)).toEqual([40, 20, 10, 255]);
  });
});
