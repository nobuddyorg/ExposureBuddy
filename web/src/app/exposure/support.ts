export interface PipelineHost {
  readonly Worker?: unknown;
  readonly OffscreenCanvas?: unknown;
  readonly createImageBitmap?: unknown;
}

/** Whether the host has what the pipeline needs: workers, OffscreenCanvas and createImageBitmap. */
export function isPipelineSupported(host: PipelineHost = globalThis): boolean {
  return (
    typeof host.Worker === 'function' &&
    typeof host.OffscreenCanvas === 'function' &&
    typeof host.createImageBitmap === 'function'
  );
}
