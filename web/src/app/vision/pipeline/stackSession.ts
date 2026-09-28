import { composite } from '../stack/composite';
import { applyGain, estimateGain } from '../stack/exposure';
import { fullCoverageRect, stackFrames } from '../stack/stack';
import type {
  AlignedFrame,
  CompositeParams,
  Rect,
  RgbaImage,
  StackResult,
} from '../types';
import type { StackSummary } from './protocol';

export interface StackSession {
  /** The frame every other frame was aligned to; must come first. */
  addReference: (image: RgbaImage) => void;
  /** Normalises the frame's exposure to the reference and keeps it. */
  addFrame: (frame: AlignedFrame) => void;
  readonly frameCount: number;
  /** Computes the per-pixel statistics and the crop; `onProgress` runs with a fraction 0–1. */
  stack: (onProgress?: (fraction: number) => void) => StackSummary;
  /** The composite for `params`, cropped; only after `stack()`. */
  render: (params: CompositeParams) => RgbaImage;
  /** The reference frame, cropped like the composite; only after `stack()`. */
  renderReference: () => RgbaImage;
  dispose: () => void;
}

interface Stacked {
  readonly result: StackResult;
  readonly rect: Rect;
}

/** Thrown by `stack()` when no pixel is covered by every aligned frame; the coordinator turns it into a failure of its own. */
export const NO_OVERLAP_MESSAGE = 'The aligned photos share no common area.';

/** The rectangle `rect` of `image` as a new image. */
export function cropRgba(image: RgbaImage, rect: Rect): RgbaImage {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  const rowBytes = rect.width * 4;
  for (let row = 0; row < rect.height; row += 1) {
    const sourceStart = ((rect.y + row) * image.width + rect.x) * 4;
    data.set(
      image.data.subarray(sourceStart, sourceStart + rowBytes),
      row * rowBytes,
    );
  }
  return { width: rect.width, height: rect.height, data };
}

function fullCoverage(image: RgbaImage): Uint8Array {
  return new Uint8Array(image.width * image.height).fill(1);
}

export function createStackSession(): StackSession {
  const frames: AlignedFrame[] = [];
  let reference: RgbaImage | null = null;
  let stacked: Stacked | null = null;

  const requireReference = (): RgbaImage => {
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
      reference = image;
      frames.push({ image, coverage: fullCoverage(image) });
    },
    addFrame(frame) {
      const base = requireReference();
      if (
        frame.image.width !== base.width ||
        frame.image.height !== base.height
      ) {
        throw new Error('Every aligned frame must have the working size.');
      }
      applyGain(
        frame.image,
        estimateGain(frame.image, base, frame.coverage),
        frame.coverage,
      );
      frames.push(frame);
    },
    get frameCount() {
      return frames.length;
    },
    stack(onProgress) {
      const base = requireReference();
      const frameCount = frames.length;
      const result = stackFrames(frames, { onProgress });
      // The frames are folded into the stack now; keeping them would hold frameCount × 5 bytes per pixel for nothing.
      frames.length = 0;
      const rect = fullCoverageRect(result.coverage, base, frameCount);
      if (rect.width === 0 || rect.height === 0) {
        throw new Error(NO_OVERLAP_MESSAGE);
      }
      stacked = { result, rect };
      return { width: base.width, height: base.height, rect, frameCount };
    },
    render(params) {
      const { result, rect } = requireStacked();
      return composite(result, params, rect);
    },
    renderReference() {
      return cropRgba(requireReference(), requireStacked().rect);
    },
    dispose() {
      frames.length = 0;
      reference = null;
      stacked = null;
    },
  };
}
