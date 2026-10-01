import { indices } from '../vision/indices';

/** When a photo was taken, as EXIF writes it ("YYYY:MM:DD HH:MM:SS", local time), or that the file does not say. */
export type ShotDate =
  | { readonly kind: 'dated'; readonly timestamp: string }
  | { readonly kind: 'undated' };

const UNDATED: ShotDate = { kind: 'undated' };
// Tested against exactly 19 characters, so the pattern needs no anchors.
const TIMESTAMP = /\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0];
const MARKER = 0xff;
const START_OF_IMAGE = 0xd8;
const START_OF_SCAN = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const DATE_TIME = 0x0132;
const EXIF_IFD_POINTER = 0x8769;
const DATE_TIME_ORIGINAL = 0x9003;
const ASCII = 2;
const LONG = 4;
const TIMESTAMP_BYTES = 20;

/** A bounds-checked reader over the TIFF block of an EXIF segment; any read past the end throws a RangeError. */
function tiffReader(view: DataView, start: number) {
  const littleEndian = view.getUint16(start) === 0x4949;
  const u16 = (offset: number) => view.getUint16(start + offset, littleEndian);
  const u32 = (offset: number) => view.getUint32(start + offset, littleEndian);
  /** Where the values of `tag` sit in the IFD at `ifd`: none when the tag is missing. */
  const find = (ifd: number, tag: number): number[] =>
    indices(u16(ifd))
      .map((entry) => ifd + 2 + entry * 12)
      .filter((at) => u16(at) === tag)
      .map((at) => at + 8);
  /** The 19 characters a timestamp takes, from the value at `valueAt`. */
  const text = (valueAt: number): string => {
    const bytes = new Uint8Array(
      view.buffer,
      view.byteOffset + start + u32(valueAt),
      TIMESTAMP_BYTES - 1,
    );
    return String.fromCharCode(...bytes);
  };
  return { u32, find, text };
}

function dateIn(view: DataView, tiffStart: number): ShotDate {
  const tiff = tiffReader(view, tiffStart);
  const ifd0 = tiff.u32(4);
  const originals = tiff
    .find(ifd0, EXIF_IFD_POINTER)
    .flatMap((pointer) => tiff.find(tiff.u32(pointer), DATE_TIME_ORIGINAL));
  // In this order, one at a time: DateTimeOriginal wins, and a broken DateTime cannot spoil a good original.
  for (const at of [...originals, ...tiff.find(ifd0, DATE_TIME)]) {
    const timestamp = tiff.text(at);
    if (TIMESTAMP.test(timestamp)) return { kind: 'dated', timestamp };
  }
  return UNDATED;
}

function isExif(bytes: Uint8Array, at: number): boolean {
  return EXIF_HEADER.every((byte, index) => bytes[at + index] === byte);
}

function scan(bytes: Uint8Array): ShotDate {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 2; bytes[at] === MARKER && bytes[at + 1] !== START_OF_SCAN;) {
    if (bytes[at + 1] === APP1 && isExif(bytes, at + 4))
      return dateIn(view, at + 10);
    at += 2 + view.getUint16(at + 2);
  }
  return UNDATED;
}

/** When the JPEG in `bytes` was taken, from EXIF DateTimeOriginal or else DateTime; undated for anything else or anything malformed. */
export function readShotDate(bytes: Uint8Array): ShotDate {
  if (bytes[0] !== MARKER || bytes[1] !== START_OF_IMAGE) return UNDATED;
  try {
    return scan(bytes);
  } catch {
    // A truncated or lying file reads past its end, and DataView and typed arrays throw: that file has no date to give.
    return UNDATED;
  }
}

/** A minimal EXIF segment: DateTime in IFD0 and DateTimeOriginal in the Exif IFD, both pointing at one little-endian timestamp. */
function exifSegment(timestamp: string): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(76));
  const ifd0 = 8;
  const exifIfd = 38;
  const text = 56;
  tiff.setUint16(0, 0x4949);
  tiff.setUint16(2, 42, true);
  tiff.setUint32(4, ifd0, true);
  const entry = (at: number, tag: number, type: number, value: number) => {
    tiff.setUint16(at, tag, true);
    tiff.setUint16(at + 2, type, true);
    tiff.setUint32(at + 4, type === ASCII ? TIMESTAMP_BYTES : 1, true);
    tiff.setUint32(at + 8, value, true);
  };
  tiff.setUint16(ifd0, 2, true);
  entry(ifd0 + 2, DATE_TIME, ASCII, text);
  entry(ifd0 + 14, EXIF_IFD_POINTER, LONG, exifIfd);
  tiff.setUint16(exifIfd, 1, true);
  entry(exifIfd + 2, DATE_TIME_ORIGINAL, ASCII, text);
  [...timestamp].forEach((character, index) =>
    tiff.setUint8(text + index, character.charCodeAt(0)),
  );
  const payload = [...EXIF_HEADER, ...new Uint8Array(tiff.buffer)];
  const length = payload.length + 2;
  return Uint8Array.from([
    MARKER,
    APP1,
    length >> 8,
    length & 0xff,
    ...payload,
  ]);
}

/**
 * The JPEG in `bytes` with an EXIF segment carrying `date`, after the JFIF header where there is one; unchanged when undated or not a JPEG.
 * Nothing but the time is written: no place, no camera, no serial number.
 */
export function withShotDate(
  bytes: Uint8Array<ArrayBuffer>,
  date: ShotDate,
): Uint8Array<ArrayBuffer> {
  const isJpeg = bytes[0] === MARKER && bytes[1] === START_OF_IMAGE;
  if (date.kind === 'undated' || !isJpeg) return bytes;
  const jfifLength =
    bytes[2] === MARKER && bytes[3] === APP0
      ? 2 + (bytes[4] << 8) + bytes[5]
      : 0;
  const insertAt = 2 + jfifLength;
  const segment = exifSegment(date.timestamp);
  const output = new Uint8Array(bytes.length + segment.length);
  output.set(bytes.subarray(0, insertAt));
  output.set(segment, insertAt);
  output.set(bytes.subarray(insertAt), insertAt + segment.length);
  return output;
}
