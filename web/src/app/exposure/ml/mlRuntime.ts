import { FilesetResolver } from '@mediapipe/tasks-vision';

import { combineProgress, fetchBytes } from './fetchBytes';

// Browser-only (MediaPipe's Wasm, fetch in a worker): proven by the e2e suite, not by unit tests.

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

export interface VisionAssets {
  /** The Wasm runtime, served from the app itself, as MediaPipe wants to be told where it is. */
  readonly fileset: WasmFileset;
  readonly model: Uint8Array;
  /** Frees the in-memory copy of the Wasm binary the fileset points at. */
  release(): void;
}

/** The model and the Wasm runtime, fetched side by side from the app's own `assetBase` folder, with one progress. */
export async function loadVisionAssets(
  assetBase: string,
  modelFile: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<VisionAssets> {
  const base = assetBase.replace(/\/$/, '');
  // The classic build of the loader: Turbopack starts every worker through a classic bootstrap that `importScripts` it.
  const resolved = await FilesetResolver.forVisionTasks(base);
  const progressOf = combineProgress(onProgress);
  const [wasm, model] = await Promise.all([
    fetchBytes(resolved.wasmBinaryPath, progressOf(0)),
    fetchBytes(`${base}/${modelFile}`, progressOf(1)),
  ]);
  const wasmUrl = URL.createObjectURL(
    new Blob([wasm as BlobPart], { type: 'application/wasm' }),
  );
  return {
    fileset: { ...resolved, wasmBinaryPath: wasmUrl },
    model,
    release: () => URL.revokeObjectURL(wasmUrl),
  };
}
