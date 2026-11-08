/** The part of a worker's global scope that can make an offscreen WebGL context. */
export interface CanvasScope {
  OffscreenCanvas?: new (
    width: number,
    height: number,
  ) => { getContext(contextId: string): unknown };
}

/** Whether `scope` can make a WebGL 2 context off the main thread: MediaPipe's Wasm needs one even on the CPU. */
export function hasWebGlInWorker(scope: CanvasScope): boolean {
  if (!scope.OffscreenCanvas) return false;
  try {
    return new scope.OffscreenCanvas(1, 1).getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
