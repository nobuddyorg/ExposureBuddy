const JPEG_TYPE = 'image/jpeg';
const JPEG_QUALITY = 0.92;

/** The canvas encoded as a JPEG; rejects when the browser produces nothing (a zero-sized or tainted canvas). */
export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The canvas could not be encoded as JPEG.'));
      },
      JPEG_TYPE,
      JPEG_QUALITY,
    );
  });
}

/** Offers `blob` to the browser's download flow under `name` through a transient `<a download>` click. */
export const REVOKE_DELAY_MS = 60_000;

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoked only after a minute: iOS Safari reads the URL once the visitor confirms its download sheet.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
