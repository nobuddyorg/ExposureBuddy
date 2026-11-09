/** Absolute URL of the folder the model and the Wasm runtime are served from: `ml/` under the app's base path. */
export function mlAssetBase(origin: string, basePath: string): string {
  return `${origin}${basePath}/ml`;
}

/** `mlAssetBase` for the page this runs on, whatever base path the build was made for; browser only. */
export function pageAssetBase(): string {
  return mlAssetBase(
    window.location.origin,
    process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  );
}
