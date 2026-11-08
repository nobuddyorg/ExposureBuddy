import { indices } from '../indices';
import type { Point, Rect } from '../types';
import { emptyLayer, type Layer } from './layer';

/** `layer` re-sampled inside `region`: the pixel at (x, y) takes what lies at (x, y) + `offsetAt(x, y)`, bilinearly. */
export function displaceLayer(
  layer: Layer,
  region: Rect,
  offsetAt: (x: number, y: number) => Point,
): Layer {
  const { width, height } = layer;
  const result = emptyLayer(width, height);
  for (const y of indices(region.height)) {
    for (const x of indices(region.width)) {
      const px = region.x + x;
      const py = region.y + y;
      const offset = offsetAt(px, py);
      const sx = Math.min(width - 1, Math.max(0, px + offset.x));
      const sy = Math.min(height - 1, Math.max(0, py + offset.y));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const target = (py * width + px) * 4;
      for (const channel of [0, 1, 2, 3]) {
        const at = (column: number, row: number) =>
          layer.data[(row * width + column) * 4 + channel];
        const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
        const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
        result.data[target + channel] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return result;
}
