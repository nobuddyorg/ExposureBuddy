import {
  adoptBands,
  bandedFromRgba,
  cropBanded,
  releaseBandsFrom,
  toRgba,
} from '../image/banded';
import { fillHole } from '../effects/inpaint';
import type { SmearSum } from '../effects/smear';
import { composite } from '../stack/composite';
import { trailMean } from '../stack/trailMean';
import { DENOISE_FROM, denoiseBanded, stackedNoise } from '../stack/denoise';
import { applyGain, estimateGain, type Gain } from '../stack/exposure';
import { emptyStack, fullCoverageRect, stackRows } from '../stack/stack';
import type {
  AlignedFrame,
  BandedRgb,
  CompositeParams,
  GrayImage,
  Rect,
  RgbaImage,
  RowRange,
  RowSpans,
  Size,
  StackResult,
} from '../types';
import type { StackSummary } from './protocol';
import { NO_OVERLAP_MESSAGE } from './protocol';

/**
 * One burst in the stack worker. The frames arrive whole and keep their first `stripRows` rows; the crop follows from what they
 * cover; then the rows are stacked strip by strip, every strip after the first arriving again through `addRows`.
 */
export interface StackSession {
  /** The frame every other frame was aligned to, and how many rows of each frame to keep until its rows are stacked; must come first. */
  addReference: (image: RgbaImage, stripRows: number) => void;
  /** Normalises the frame's exposure to the reference and keeps its first strip, under the burst `index` addRows refers to. */
  addFrame: (index: number, frame: AlignedFrame) => void;
  /** Where something moves in frame `index` (or the reference), laid over the reference at any size; once every frame has one, the background leaves them out. */
  addMask: (index: number | 'reference', mask: GrayImage) => void;
  /** The movers of `frames` sampled frames, smeared along their paths at the working size; after the rows are stacked, before the first render. */
  setTrail: (sum: SmearSum, frames: number) => void;
  /** Forgets frame `index` again, so it neither decides the crop nor is stacked; only before `crop()`. */
  dropFrame: (index: number) => void;
  readonly frameCount: number;
  /** Fixes the crop every frame covers and makes room for the result; after the last addFrame. */
  crop: () => StackSummary;
  /** Stacks `rows` (inside the crop) of every frame into the result and lets them go; `onProgress` runs with a fraction 0–1. */
  stackRows: (rows: RowRange, onProgress?: (fraction: number) => void) => void;
  /** Brings `rows` of frame `index` in again, warped anew, with the exposure gain its first strip got. */
  addRows: (index: number, frame: AlignedFrame, rows: RowRange) => void;
  /** The composite for `params`, crop-sized; only after the rows are stacked. */
  render: (params: CompositeParams) => RgbaImage;
  /** The reference frame, cropped like the composite; only after `crop()`. */
  renderReference: () => RgbaImage;
  dispose: () => void;
}

interface Kept {
  readonly frame: AlignedFrame;
  readonly gain: Gain;
}

interface Cropped {
  readonly rect: Rect;
  readonly result: StackResult;
  /** Where every frame shows a mover (crop-sized), or null when no masks were given; filled from the surroundings once, at the first render. */
  readonly holes: GrayImage | null;
  readonly reference: BandedRgb;
}

function fullSpans(size: Size): RowSpans {
  return {
    start: new Int32Array(size.height),
    end: new Int32Array(size.height).fill(size.width),
  };
}

export function createStackSession(): StackSession {
  const frames = new Map<number, Kept>();
  let reference: AlignedFrame | null = null;
  let stripRows = 0;
  const masks = new Map<number | 'reference', GrayImage>();
  // The burst's own noise, sampled while it is stacked: what decides whether the long exposure is smoothed.
  const noise = new Uint32Array(256);
  let cropped: Cropped | null = null;
  let trail: { readonly sum: SmearSum; readonly frames: number } | null = null;

  const requireReference = (): AlignedFrame => {
    if (!reference) throw new Error('The reference frame must be added first.');
    return reference;
  };
  const requireCropped = (): Cropped => {
    if (!cropped) throw new Error('Nothing has been stacked yet.');
    return cropped;
  };
  // The masks count only when every frame has one: a frame without is one that might show a mover where the others do not.
  const hiddenMasks = (): GrayImage[] | undefined => {
    const ordered = ['reference' as const, ...frames.keys()].map((key) =>
      masks.get(key),
    );
    return ordered.every((mask) => mask !== undefined) ? ordered : undefined;
  };
  const allFrames = (): AlignedFrame[] => [
    requireReference(),
    ...[...frames.values()].map((kept) => kept.frame),
  ];

  // Where no frame showed the scene the median is a smear of movers; the colours around the hole replace it, once.
  const fillHoles = (): void => {
    const current = requireCropped();
    if (!current.holes) return;
    const filled = fillHole(
      toRgba(current.result.backgrounds.median),
      current.holes,
    );
    const { backgrounds } = current.result;
    cropped = {
      ...current,
      holes: null,
      result: {
        ...current.result,
        backgrounds: { ...backgrounds, median: bandedFromRgba(filled) },
      },
    };
  };

  // Noise the stack left in the background and the long exposure is smoothed once, at the first render; a clean burst is left as stacked.
  let denoised = false;
  const denoiseOnce = (): void => {
    if (denoised) return;
    denoised = true;
    const current = requireCropped();
    const level = stackedNoise(noise, current.result.frameCount);
    if (level < DENOISE_FROM) return;
    const { backgrounds, mean } = current.result;
    cropped = {
      ...current,
      result: {
        ...current.result,
        backgrounds: {
          ...backgrounds,
          median: denoiseBanded(backgrounds.median, level),
        },
        mean: denoiseBanded(mean, level),
      },
    };
  };

  // With trails, the long exposure is redrawn for the background asked for and the trail slider.
  const trailed = (
    result: StackResult,
    rect: Rect,
    params: CompositeParams,
  ): StackResult =>
    trail
      ? {
          ...result,
          mean: trailMean({
            background: result.backgrounds[params.background],
            mean: result.mean,
            sum: trail.sum,
            frames: trail.frames,
            rect,
            amount: params.trail,
          }),
        }
      : result;

  return {
    addReference(image, rows) {
      if (reference) throw new Error('The reference frame was already added.');
      const banded = bandedFromRgba(image);
      reference = { image: banded, spans: fullSpans(banded) };
      stripRows = rows;
    },
    addFrame(index, frame) {
      const base = requireReference().image;
      if (
        frame.image.width !== base.width ||
        frame.image.height !== base.height
      ) {
        throw new Error('Every aligned frame must have the working size.');
      }
      if (frames.has(index)) throw new Error(`Frame ${index} came twice.`);
      const gain = estimateGain(frame, base);
      const kept = { start: 0, end: Math.min(stripRows, base.height) };
      applyGain(frame, gain, kept);
      releaseBandsFrom(frame.image, kept.end);
      frames.set(index, { frame, gain });
    },
    dropFrame(index) {
      if (cropped) throw new Error('A frame cannot be dropped after the crop.');
      if (!frames.delete(index))
        throw new Error(`Frame ${index} was never added.`);
      masks.delete(index);
    },
    setTrail(sum, frames) {
      trail = { sum, frames };
    },
    addMask(index, mask) {
      masks.set(index, mask);
    },
    get frameCount() {
      return frames.size + (reference ? 1 : 0);
    },
    crop() {
      const base = requireReference().image;
      const everyFrame = allFrames();
      const rect = fullCoverageRect(
        everyFrame.map((frame) => frame.spans),
        base,
      );
      // No pixel covered by every frame: fullCoverageRect answers with the zero rect.
      if (rect.width === 0) throw new Error(NO_OVERLAP_MESSAGE);
      cropped = {
        rect,
        result: emptyStack(rect, everyFrame.length),
        holes: hiddenMasks()
          ? {
              width: rect.width,
              height: rect.height,
              data: new Uint8Array(rect.width * rect.height),
            }
          : null,
        // Copied now: stacking frees the reference's bands along with every other frame's.
        reference: cropBanded(base, rect),
      };
      return {
        width: base.width,
        height: base.height,
        rect,
        frameCount: everyFrame.length,
      };
    },
    stackRows(rows, onProgress) {
      const { rect, result, holes } = requireCropped();
      stackRows(allFrames(), result, {
        rect,
        rows,
        hidden: hiddenMasks(),
        holes: holes ?? undefined,
        noise,
        onProgress,
      });
    },
    addRows(index, frame, rows) {
      const kept = frames.get(index);
      if (!kept) throw new Error(`Frame ${index} was never added.`);
      applyGain(frame, kept.gain, rows);
      adoptBands(kept.frame.image, frame.image);
    },
    render(params) {
      fillHoles();
      denoiseOnce();
      const { result, rect } = requireCropped();
      return composite(trailed(result, rect, params), params);
    },
    renderReference() {
      return toRgba(requireCropped().reference);
    },
    dispose() {
      trail = null;
      frames.clear();
      masks.clear();
      reference = null;
      cropped = null;
    },
  };
}
