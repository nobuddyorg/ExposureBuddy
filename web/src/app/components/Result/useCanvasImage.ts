'use client';

import { useEffect, useRef, type RefObject } from 'react';

import type { RgbaImage } from '../../vision/types';

/** Owns the canvas ref and draws `image` onto it whenever a new one arrives; nothing is drawn for `null`. */
export function useCanvasImage(
  image: RgbaImage | null,
): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = image.width;
    canvas.height = image.height;
    // The buffer is the worker's transferred copy, so it can back the ImageData without another copy.
    context.putImageData(
      new ImageData(
        image.data as Uint8ClampedArray<ArrayBuffer>,
        image.width,
        image.height,
      ),
      0,
      0,
    );
  }, [image]);

  return canvasRef;
}
