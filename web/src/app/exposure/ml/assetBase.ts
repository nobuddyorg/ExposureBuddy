/** Absolute URL of the folder the model and the Wasm runtime are served from: `ml/` under the app's base path. */
export function mlAssetBase(origin: string, basePath: string): string {
  return `${origin}${basePath}/ml`;
}
