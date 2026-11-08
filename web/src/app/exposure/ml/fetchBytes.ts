/** Fetches `url` into memory, reporting bytes loaded so far; `total` is 0 when the server did not say how big the file is. */
export async function fetchBytes(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  const total = Number(response.headers.get('content-length')) || 0;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress(loaded, total);
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  } else {
    const whole = new Uint8Array(await response.arrayBuffer());
    chunks.push(whole);
    loaded = whole.byteLength;
    onProgress(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Combines the progress of downloads that run side by side into one `loaded` of `total`; one that has not reported counts as nothing. */
export function combineProgress(
  onProgress: (loaded: number, total: number) => void,
): (index: number) => (loaded: number, total: number) => void {
  const downloads: { loaded: number; total: number }[] = [];
  return (index) => (loaded, total) => {
    downloads[index] = { loaded, total };
    const sum = downloads.reduce((all, one) => all + one.total, 0);
    const done = downloads.reduce((all, one) => all + one.loaded, 0);
    // A server that compresses reports the compressed size, so what was loaded can pass it.
    onProgress(Math.min(done, sum), sum);
  };
}
