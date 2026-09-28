import { inflateSync } from 'node:zlib';

/** Interleaved RGBA 8-bit, row-major, no padding, as a canvas's ImageData holds it. */
export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS_BY_COLOR_TYPE: Record<number, number> = { 0: 1, 2: 3, 6: 4 };

function readChunks(bytes: Buffer) {
  const chunks: { type: string; data: Buffer }[] = [];
  let offset = SIGNATURE.length;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    chunks.push({
      type,
      data: bytes.subarray(offset + 8, offset + 8 + length),
    });
    offset += 12 + length;
  }
  return chunks;
}

const paeth = (left: number, up: number, upLeft: number) => {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
};

/** Undoes the per-scanline filter in place; `previous` is the already-unfiltered row above (zeros for the first). */
function unfilterRow(
  filter: number,
  row: Uint8Array,
  previous: Uint8Array,
  bytesPerPixel: number,
) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previous[index];
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    let predictor = 0;
    if (filter === 1) predictor = left;
    else if (filter === 2) predictor = up;
    else if (filter === 3) predictor = (left + up) >> 1;
    else if (filter === 4) predictor = paeth(left, up, upLeft);
    row[index] = (row[index] + predictor) & 0xff;
  }
}

function toRgba(
  scanlines: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Uint8ClampedArray {
  const stride = width * channels;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const row = scanlines.slice(start + 1, start + 1 + stride);
    unfilterRow(scanlines[start], row, previous, channels);
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      rgba[target] = row[source];
      rgba[target + 1] = channels < 3 ? row[source] : row[source + 1];
      rgba[target + 2] = channels < 3 ? row[source] : row[source + 2];
      rgba[target + 3] = channels === 4 ? row[source + 3] : 255;
    }
    previous = row;
  }
  return rgba;
}

/** Decodes a non-interlaced 8-bit grayscale, RGB or RGBA PNG (what make-fixtures.mjs and most tools write) to RGBA. */
export function decodePng(bytes: Buffer): DecodedPng {
  if (!SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error('not a PNG: bad signature');
  }
  const chunks = readChunks(bytes);
  const header = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (!header) throw new Error('not a PNG: no IHDR');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [bitDepth, colorType, interlace] = [header[8], header[9], header[12]];
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (bitDepth !== 8 || channels === undefined || interlace !== 0) {
    throw new Error(
      `unsupported PNG: bit depth ${bitDepth}, colour type ${colorType}, interlace ${interlace}`,
    );
  }
  const compressed = Buffer.concat(
    chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data),
  );
  const scanlines = new Uint8Array(inflateSync(compressed));
  return { width, height, data: toRgba(scanlines, width, height, channels) };
}
