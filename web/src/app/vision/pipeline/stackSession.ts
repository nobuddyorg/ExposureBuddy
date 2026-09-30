import {
  adoptBands,
  bandedFromRgba,
  cropBanded,
  releaseBandsFrom,
  toRgba,
} from '../image/banded';
import { composite } from '../stack/composite';
import { applyGain, estimateGain, type Gain } from '../stack/exposure';
import { emptyStack, fullCoverageRect, stackRows } from '../stack/stack';
import type {
  AlignedFrame,
  BandedRgb,
  CompositeParams,
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
  let cropped: Cropped | null = null;

  const requireReference = (): AlignedFrame => {
    if (!reference) throw new Error('The reference frame must be added first.');
    return reference;
  };
  const requireCropped = (): Cropped => {
    if (!cropped) throw new Error('Nothing has been stacked yet.');
    return cropped;
  };
  const allFrames = (): AlignedFrame[] => [
    requireReference(),
    ...[...frames.values()].map((kept) => kept.frame),
  ];

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
      const { rect, result } = requireCropped();
      stackRows(allFrames(), result, { rect, rows, onProgress });
    },
    addRows(index, frame, rows) {
      const kept = frames.get(index);
      if (!kept) throw new Error(`Frame ${index} was never added.`);
      applyGain(frame, kept.gain, rows);
      adoptBands(kept.frame.image, frame.image);
    },
    render(params) {
      return composite(requireCropped().result, params);
    },
    renderReference() {
      return toRgba(requireCropped().reference);
    },
    dispose() {
      frames.clear();
      reference = null;
      cropped = null;
    },
  };
}
