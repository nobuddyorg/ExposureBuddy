import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

/** The PNG at `path` re-encoded as a JPEG by the browser `page` runs in: no EXIF, like a canvas export. */
export async function jpegFromPng(page: Page, path: string): Promise<Buffer> {
  const png = readFileSync(path).toString('base64');
  const jpeg = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    );
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: 'image/png' }),
    );
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    );
    if (!blob) throw new Error('the browser made no JPEG');
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, png);
  return Buffer.from(jpeg);
}

/**
 * `jpeg` with a big-endian EXIF segment right after its start-of-image marker, holding only DateTimeOriginal in the Exif IFD:
 * written differently from the app's own little-endian writer, so the two are not checked against each other.
 */
export function withDateTimeOriginal(jpeg: Buffer, timestamp: string): Buffer {
  const tiff = Buffer.alloc(8 + 18 + 18 + 20);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  // IFD0: one entry, the pointer to the Exif IFD at 26.
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x8769, 10);
  tiff.writeUInt16BE(4, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18);
  // Exif IFD: DateTimeOriginal, 20 ASCII bytes at 44.
  tiff.writeUInt16BE(1, 26);
  tiff.writeUInt16BE(0x9003, 28);
  tiff.writeUInt16BE(2, 30);
  tiff.writeUInt32BE(20, 32);
  tiff.writeUInt32BE(44, 36);
  tiff.write(timestamp, 44, 'latin1');
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([
    jpeg.subarray(0, 2),
    header,
    payload,
    jpeg.subarray(2),
  ]);
}
