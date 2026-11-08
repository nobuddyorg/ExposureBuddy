import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { emptyLayer, type Layer } from './layer';
import { blurAlongLine } from './lineBlur';

const WHOLE = (layer: Layer) => ({
  x: 0,
  y: 0,
  width: layer.width,
  height: layer.height,
});

function impulse(width: number, height: number, x: number, y: number): Layer {
  const layer = emptyLayer(width, height);
  layer.data.set([100, 100, 100, 100], (y * width + x) * 4);
  return layer;
}

const alphaOf = (layer: Layer, x: number, y: number) =>
  layer.data[(y * layer.width + x) * 4 + 3];
const alphaRow = (layer: Layer, y: number) =>
  Array.from({ length: layer.width }, (_, x) => alphaOf(layer, x, y));
const total = (layer: Layer) =>
  layer.data.reduce((sum, value) => sum + value, 0);

describe('blurAlongLine', () => {
  it('leaves the layer as it is at length 0', () => {
    const layer = impulse(9, 3, 4, 1);
    const same = blurAlongLine(layer, WHOLE(layer), {
      angle: 30,
      length: 0,
      trailing: false,
    });
    expect(same.data).toEqual(layer.data);
  });

  it('spreads a point along the row at angle 0 and nowhere else', () => {
    const layer = impulse(15, 5, 7, 2);
    const blurred = blurAlongLine(layer, WHOLE(layer), {
      angle: 0,
      length: 4,
      trailing: false,
    });
    const row = alphaRow(blurred, 2);
    expect(row.filter((value) => value > 0)).toHaveLength(5);
    expect(row[7]).toBeCloseTo(20);
    expect(row[5]).toBeCloseTo(20);
    expect(row[9]).toBeCloseTo(20);
    expect(row[4]).toBe(0);
    expect(row[10]).toBe(0);
    expect(alphaRow(blurred, 1).every((value) => value === 0)).toBe(true);
  });

  it('spreads a point down the column at angle 90', () => {
    const layer = impulse(5, 15, 2, 7);
    const blurred = blurAlongLine(layer, WHOLE(layer), {
      angle: 90,
      length: 4,
      trailing: false,
    });
    expect(alphaOf(blurred, 2, 5)).toBeCloseTo(20);
    expect(alphaOf(blurred, 2, 9)).toBeCloseTo(20);
    expect(alphaOf(blurred, 1, 7)).toBe(0);
  });

  it('keeps all the mass of a point away from the edges', () => {
    const layer = impulse(31, 31, 15, 15);
    for (const angle of [0, 37, 90, 145]) {
      const blurred = blurAlongLine(layer, WHOLE(layer), {
        angle,
        length: 8,
        trailing: false,
      });
      expect(total(blurred)).toBeCloseTo(total(layer), 3);
    }
  });

  it('leaves a trail behind the movement and nowhere ahead of it', () => {
    const layer = impulse(25, 3, 12, 1);
    const smeared = blurAlongLine(layer, WHOLE(layer), {
      angle: 0,
      length: 8,
      trailing: true,
    });
    const row = alphaRow(smeared, 1);
    expect(row[12]).toBeGreaterThan(row[8]);
    expect(row[4]).toBeGreaterThan(0);
    expect(row[3]).toBe(0);
    expect(row.slice(13).every((value) => value === 0)).toBe(true);
    expect(row.slice(4, 13)).toEqual(
      [...row.slice(4, 13)].sort((a, b) => a - b),
    );
    expect(total(smeared)).toBeCloseTo(total(layer), 3);
  });

  it('puts the trail on the other side when the direction turns round', () => {
    const layer = impulse(25, 3, 12, 1);
    const smeared = blurAlongLine(layer, WHOLE(layer), {
      angle: 180,
      length: 8,
      trailing: true,
    });
    const row = alphaRow(smeared, 1);
    expect(row[16]).toBeGreaterThan(0);
    expect(row[8]).toBe(0);
  });

  it('keeps a constant layer constant, edges included', () => {
    const layer = emptyLayer(6, 6);
    layer.data.fill(77);
    const blurred = blurAlongLine(layer, WHOLE(layer), {
      angle: 45,
      length: 20,
      trailing: false,
    });
    expect(blurred.data.every((value) => Math.abs(value - 77) < 1e-3)).toBe(
      true,
    );
  });

  it('writes only inside the region', () => {
    const layer = impulse(15, 5, 7, 2);
    const blurred = blurAlongLine(
      layer,
      { x: 6, y: 2, width: 3, height: 1 },
      { angle: 0, length: 4, trailing: false },
    );
    expect(alphaRow(blurred, 2).filter((value) => value > 0)).toHaveLength(3);
    expect(alphaOf(blurred, 5, 2)).toBe(0);
  });

  it('caps the work however long the line is, and never invents light', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 359 }),
        fc.boolean(),
        (length, angle, trailing) => {
          const layer = impulse(21, 21, 10, 10);
          const blurred = blurAlongLine(layer, WHOLE(layer), {
            angle,
            length,
            trailing,
          });
          expect(Math.max(...blurred.data)).toBeLessThanOrEqual(100 + 1e-3);
          expect(Math.min(...blurred.data)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});
