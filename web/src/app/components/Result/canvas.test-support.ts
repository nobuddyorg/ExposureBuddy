import { vi, type Mock } from 'vitest';

import type { RgbaImage } from '../../vision/types';

export interface CanvasStubs {
  /** The one 2D context every canvas answers with. */
  readonly context: { putImageData: Mock };
  readonly toBlob: Mock;
  restore(): void;
}

// jsdom has no ImageData; this stand-in carries what putImageData is asserted on.
class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

/** Stubs jsdom's context-less canvas: `getContext('2d')` answers one recording context, `toBlob` a JPEG blob. */
export function installCanvasStubs(): CanvasStubs {
  const context = { putImageData: vi.fn() };
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => context as unknown as CanvasRenderingContext2D);
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback, type) => {
      callback(new Blob(['jpeg-bytes'], { type: type ?? 'image/png' }));
    });
  const hadImageData = 'ImageData' in globalThis;
  if (!hadImageData) vi.stubGlobal('ImageData', FakeImageData);
  return {
    context,
    toBlob,
    restore: () => {
      getContext.mockRestore();
      toBlob.mockRestore();
      if (!hadImageData) vi.unstubAllGlobals();
    },
  };
}

/** A `width × height` RGBA image filled with `value`, distinct per call so two renders can be told apart. */
export function rgbaImage(
  width: number,
  height: number,
  value = 128,
): RgbaImage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(value),
  };
}

/** A promise settled from outside, for renders that must resolve in a chosen order. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
