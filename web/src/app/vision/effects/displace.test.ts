import { describe, expect, it } from 'vitest';

import { displaceLayer } from './displace';
import { emptyLayer, type Layer } from './layer';

const WHOLE = (layer: Layer) => ({
  x: 0,
  y: 0,
  width: layer.width,
  height: layer.height,
});
const alphaOf = (layer: Layer, x: number, y: number) =>
  layer.data[(y * layer.width + x) * 4 + 3];

function impulse(width: number, height: number, x: number, y: number): Layer {
  const layer = emptyLayer(width, height);
  layer.data.set([10, 20, 30, 100], (y * width + x) * 4);
  return layer;
}

describe('displaceLayer', () => {
  it('copies the layer when nothing is displaced', () => {
    const layer = impulse(5, 5, 2, 2);
    const same = displaceLayer(layer, WHOLE(layer), () => ({ x: 0, y: 0 }));
    expect(same.data).toEqual(layer.data);
    expect(same.data).not.toBe(layer.data);
  });

  it('moves content opposite to the offset, whole pixels at a time', () => {
    const layer = impulse(7, 7, 4, 3);
    const moved = displaceLayer(layer, WHOLE(layer), () => ({ x: 2, y: 1 }));
    expect(alphaOf(moved, 2, 2)).toBe(100);
    expect(alphaOf(moved, 4, 3)).toBe(0);
    expect(
      Array.from(moved.data.subarray((2 * 7 + 2) * 4, (2 * 7 + 2) * 4 + 3)),
    ).toEqual([10, 20, 30]);
  });

  it('interpolates between pixels for a fractional offset', () => {
    const layer = impulse(5, 1, 2, 0);
    const half = displaceLayer(layer, WHOLE(layer), () => ({ x: 0.5, y: 0 }));
    expect(alphaOf(half, 1, 0)).toBeCloseTo(50);
    expect(alphaOf(half, 2, 0)).toBeCloseTo(50);
    const down = displaceLayer(
      impulse(1, 5, 0, 2),
      { x: 0, y: 0, width: 1, height: 5 },
      () => ({ x: 0, y: 0.25 }),
    );
    expect(alphaOf(down, 0, 1)).toBeCloseTo(25);
    expect(alphaOf(down, 0, 2)).toBeCloseTo(75);
  });

  it('asks for the offset at each pixel of the region, in image coordinates', () => {
    const layer = emptyLayer(6, 4);
    const asked: string[] = [];
    displaceLayer(layer, { x: 2, y: 1, width: 2, height: 2 }, (x, y) => {
      asked.push(`${x},${y}`);
      return { x: 0, y: 0 };
    });
    expect(asked.sort()).toEqual(['2,1', '2,2', '3,1', '3,2']);
  });

  it('replicates the edge when an offset points outside the image', () => {
    const layer = emptyLayer(3, 3);
    layer.data.fill(40);
    const moved = displaceLayer(layer, WHOLE(layer), () => ({ x: -50, y: 90 }));
    expect(moved.data.every((value) => value === 40)).toBe(true);
  });

  it('writes nothing outside the region', () => {
    const layer = impulse(5, 5, 2, 2);
    const moved = displaceLayer(
      layer,
      { x: 0, y: 0, width: 2, height: 2 },
      () => ({ x: 0, y: 0 }),
    );
    expect(alphaOf(moved, 2, 2)).toBe(0);
  });
});
