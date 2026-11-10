import { indices } from '../indices';
import type { GrayImage } from '../types';

const INSIDE = 128;
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The 4-connected areas of `mask`'s set pixels, as one list of pixel indices each. */
export function areasOf(mask: GrayImage): number[][] {
  const { width, height, data } = mask;
  const seen = new Uint8Array(data.length);
  const areas: number[][] = [];
  for (const start of indices(data.length)) {
    if (data[start] < INSIDE || seen[start] === 1) continue;
    const area: number[] = [];
    const pending = [start];
    seen[start] = 1;
    while (pending.length > 0) {
      const pixel = pending.pop() as number;
      area.push(pixel);
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (data[next] < INSIDE || seen[next] === 1) continue;
        seen[next] = 1;
        pending.push(next);
      }
    }
    areas.push(area);
  }
  return areas;
}
