import { bandedFromRgba, cropBanded, toRgba } from '../image/banded';
import { composite } from '../stack/composite';
import { applyGain, estimateGain } from '../stack/exposure';
import { fullCoverageRect, stackFrames } from '../stack/stack';
import type {
  AlignedFrame,
  BandedRgb,
  CompositeParams,
  Rect,
  RgbaImage,
  RowSpans,
  Size,
  StackResult,
} from '../types';
import type { StackSummary } from './protocol';
import { NO_OVERLAP_MESSAGE } from './protocol';

export interface StackSession {
  /** The frame every other frame was aligned to; must come first. */
  addReference: (image: RgbaImage) => void;
  /** Normalises the frame's exposure to the reference and keeps it. */
  addFrame: (frame: AlignedFrame) => void;
  readonly frameCount: number;
  /** Computes the per-pixel statistics inside the crop every frame covers; `onProgress` runs with a fraction 0–1. */
  stack: (onProgress?: (fraction: number) => void) => StackSummary;
  /** The composite for `params`, crop-sized; only after `stack()`. */
  render: (params: CompositeParams) => RgbaImage;
  /** The reference frame, cropped like the composite; only after `stack()`. */
  renderReference: () => RgbaImage;
  dispose: () => void;
}

interface Stacked {
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
  const frames: AlignedFrame[] = [];
  let reference: BandedRgb | null = null;
  let stacked: Stacked | null = null;

  const requireReference = (): BandedRgb => {
    if (!reference) throw new Error('The reference frame must be added first.');
    return reference;
  };
  const requireStacked = (): Stacked => {
    if (!stacked) throw new Error('Nothing has been stacked yet.');
    return stacked;
  };

  return {
    addReference(image) {
      if (reference) throw new Error('The reference frame was already added.');
      const banded = bandedFromRgba(image);
      reference = banded;
      frames.push({ image: banded, spans: fullSpans(banded) });
    },
    addFrame(frame) {
      const base = requireReference();
      if (
        frame.image.width !== base.width ||
        frame.image.height !== base.height
      ) {
        throw new Error('Every aligned frame must have the working size.');
      }
      applyGain(frame, estimateGain(frame, base));
      frames.push(frame);
    },
    get frameCount() {
      return frames.length;
    },
    stack(onProgress) {
      const base = requireReference();
      const rect: Rect = fullCoverageRect(
        frames.map((frame) => frame.spans),
        base,
      );
      // No pixel covered by every frame: fullCoverageRect answers with the zero rect.
      if (rect.width === 0) throw new Error(NO_OVERLAP_MESSAGE);
      // Copied before stacking frees the reference's bands along with every other frame's.
      const croppedReference = cropBanded(base, rect);
      const frameCount = frames.length;
      const result = stackFrames(frames, { rect, onProgress });
      frames.length = 0;
      reference = croppedReference;
      stacked = { result, reference: croppedReference };
      return { width: base.width, height: base.height, rect, frameCount };
    },
    render(params) {
      return composite(requireStacked().result, params);
    },
    renderReference() {
      return toRgba(requireStacked().reference);
    },
    dispose() {
      frames.length = 0;
      reference = null;
      stacked = null;
    },
  };
}
