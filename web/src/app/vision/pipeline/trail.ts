import { featherMask, resizeMask } from '../effects/mask';
import { addSmear, type SmearSum } from '../effects/smear';
import type { GrayImage, RgbaImage, Size } from '../types';
import { areasOf } from './areas';
import { MIN_TRACKED_AREA, type TrackedArea } from './trackAreas';

/** How the movers of a burst are drawn as trails. */
export interface TrailSettings {
  /** How far people who stand about are blurred, as a share of the long edge; 0 leaves them as they are. */
  readonly standingBlur: number;
}

/** The soft edge of a mover's streak, as a share of the long edge. */
const EDGE_SHARE = 0.001;

function weightOf(
  pixels: readonly number[],
  mask: Size,
  target: Size,
): GrayImage {
  const data = new Uint8Array(mask.width * mask.height);
  for (const pixel of pixels) data[pixel] = 255;
  const edge = Math.max(
    1,
    Math.round(EDGE_SHARE * Math.max(target.width, target.height)),
  );
  return featherMask(resizeMask({ ...mask, data }, target), edge);
}

/** What one sampled frame contributes: its movers, each smeared along its way to the next sample, and people who stand about, blurred. */
export interface TrailFrame {
  /** The frame aligned to the reference, at the working size. */
  readonly image: RgbaImage;
  readonly moving: readonly TrackedArea[];
  /** Mask-sized: where people who stand about are. */
  readonly standing: GrayImage;
}

/** Adds the trails of one sampled frame to `sum`. */
export function addTrailFrame(
  sum: SmearSum,
  frame: TrailFrame,
  settings: TrailSettings,
): void {
  const { image, standing } = frame;
  const scale = image.width / standing.width;
  const longEdge = Math.max(image.width, image.height);
  const blur = settings.standingBlur * longEdge;
  const place = (
    pixels: readonly number[],
    path: Parameters<typeof addSmear>[3],
  ) => addSmear(sum, image, weightOf(pixels, standing, image), path);
  for (const area of frame.moving) {
    if (area.standing) {
      if (blur > 0) place(area.pixels, { dx: blur, dy: 0, centred: true });
      continue;
    }
    place(area.pixels, {
      dx: area.step.x * scale,
      dy: area.step.y * scale,
      centred: false,
    });
  }
  if (blur === 0) return;
  for (const pixels of areasOf(standing)) {
    if (pixels.length < MIN_TRACKED_AREA) continue;
    place(pixels, { dx: blur, dy: 0, centred: true });
  }
}
