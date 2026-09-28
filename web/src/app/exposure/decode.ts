import { chooseWorkingSize } from '../vision/pipeline/budget';
import type {
  DecodedReference,
  WorkingSizing,
} from '../vision/pipeline/protocol';
import type { RgbaImage, Size } from '../vision/types';

// Browser-only (createImageBitmap, OffscreenCanvas): runs in the align workers, proven by the e2e suite.

async function toBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    // An engine that does not know the option throws a TypeError; it applies EXIF orientation by default anyway.
    if (error instanceof TypeError) return createImageBitmap(file);
    throw error;
  }
}

function contextOf(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No 2D context on OffscreenCanvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  return context;
}

/** `bitmap` scaled to `target`, halving in steps first: one big reduction samples only a few source pixels. */
function drawScaled(bitmap: ImageBitmap, target: Size): RgbaImage {
  let source: ImageBitmap | OffscreenCanvas = bitmap;
  let width = bitmap.width;
  let height = bitmap.height;
  while (width >= target.width * 2 && height >= target.height * 2) {
    width = Math.ceil(width / 2);
    height = Math.ceil(height / 2);
    const half = new OffscreenCanvas(width, height);
    contextOf(half).drawImage(source, 0, 0, width, height);
    source = half;
  }
  const canvas = new OffscreenCanvas(target.width, target.height);
  const context = contextOf(canvas);
  context.drawImage(source, 0, 0, target.width, target.height);
  const { data } = context.getImageData(0, 0, target.width, target.height);
  return { width: target.width, height: target.height, data };
}

/** Decodes the reference and picks the working size from its dimensions and the burst's size. */
export async function decodeReference(
  file: Blob,
  sizing: WorkingSizing,
): Promise<DecodedReference> {
  const bitmap = await toBitmap(file);
  try {
    const source = { width: bitmap.width, height: bitmap.height };
    const working = chooseWorkingSize({ source, ...sizing });
    return { image: drawScaled(bitmap, working), source };
  } finally {
    bitmap.close();
  }
}

/** Decodes `file` straight to the working size every frame shares. */
export async function decodeAt(file: Blob, target: Size): Promise<RgbaImage> {
  const bitmap = await toBitmap(file);
  try {
    return drawScaled(bitmap, target);
  } finally {
    bitmap.close();
  }
}

/** Whether `error` is the browser refusing to decode a file, as opposed to a bug. */
export function isDecodeFailure(error: unknown): boolean {
  return error instanceof DOMException;
}
