import { indices } from '../indices';
import type { Rect } from '../types';
import { emptyLayer, type Layer } from './layer';

/** Taps along the line: more would not change what the eye sees, only the cost. */
const MAX_TAPS = 48;
/** How fast a trailing smear fades: the weight at its far end is exp(−FADE) of the weight at its head. */
const FADE = 3;

export interface LineKernel {
  /** Direction of the line in degrees, 0 being to the right and 90 down. */
  readonly angle: number;
  /** Length of the line in pixels; 0 leaves the layer as it is. */
  readonly length: number;
  /** A smear that trails behind the movement and fades, rather than a blur centred on each point. */
  readonly trailing: boolean;
}

interface Tap {
  readonly dx: number;
  readonly dy: number;
  readonly weight: number;
}

function tapsOf(kernel: LineKernel): Tap[] {
  // One tap per pixel of the line and one more, so a centred line has a tap on its own point.
  const count = Math.min(MAX_TAPS, Math.ceil(kernel.length) + 1);
  const radians = (kernel.angle * Math.PI) / 180;
  const raw = indices(count).map((index) => {
    const along = count === 1 ? 0 : index / (count - 1);
    // A centred line reaches half its length each way; a trailing one only ahead, so the smear lands behind the movement.
    const distance = kernel.trailing
      ? along * kernel.length
      : (along - 0.5) * kernel.length;
    return {
      dx: Math.round(Math.cos(radians) * distance),
      dy: Math.round(Math.sin(radians) * distance),
      weight: kernel.trailing ? Math.exp(-FADE * along) : 1,
    };
  });
  const total = raw.reduce((sum, tap) => sum + tap.weight, 0);
  return raw.map((tap) => ({ ...tap, weight: tap.weight / total }));
}

/** `layer` averaged along a line through every pixel of `region`; outside it the result is empty, and the edges are replicated. */
export function blurAlongLine(
  layer: Layer,
  region: Rect,
  kernel: LineKernel,
): Layer {
  const { width, height } = layer;
  const result = emptyLayer(width, height);
  const taps = tapsOf(kernel);
  for (const y of indices(region.height)) {
    for (const x of indices(region.width)) {
      const target = ((region.y + y) * width + region.x + x) * 4;
      for (const tap of taps) {
        const sx = Math.min(width - 1, Math.max(0, region.x + x + tap.dx));
        const sy = Math.min(height - 1, Math.max(0, region.y + y + tap.dy));
        const source = (sy * width + sx) * 4;
        for (const channel of [0, 1, 2, 3])
          result.data[target + channel] +=
            layer.data[source + channel] * tap.weight;
      }
    }
  }
  return result;
}
