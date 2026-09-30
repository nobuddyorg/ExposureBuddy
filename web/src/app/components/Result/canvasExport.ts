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

export const REVOKE_DELAY_MS = 60_000;

interface SavePicker {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

/**
 * Saves `blob` under `name`: through the save dialog where the browser has one, which rejects with an
 * AbortError when cancelled; elsewhere through a transient `<a download>` click, which cannot report a cancel.
 */
export async function saveBlob(blob: Blob, name: string): Promise<void> {
  const { showSaveFilePicker } = window as SavePicker;
  if (!showSaveFilePicker) return downloadBlob(blob, name);
  const handle = await showSaveFilePicker.call(window, {
    suggestedName: name,
    types: [{ accept: { [JPEG_TYPE]: ['.jpg', '.jpeg'] } }],
  });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function downloadBlob(blob: Blob, name: string): void {
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
