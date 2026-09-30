import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { readShotDate, withShotDate, type ShotDate } from './exifDate';

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
const JFIF = [
  0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
];
const SCAN = [0xff, 0xda, 0, 4, 1, 2];

interface Entry {
  readonly tag: number;
  readonly type: number;
  readonly value: number;
  readonly count?: number;
}

/** A TIFF block with the given IFDs; `strings` go at the end and entries point at them by their `value` offset. */
function tiff(
  littleEndian: boolean,
  layout: { ifd0: Entry[]; exif?: Entry[]; text?: string },
): number[] {
  const view = new DataView(new ArrayBuffer(128));
  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  const writeIfd = (at: number, entries: Entry[]) => {
    view.setUint16(at, entries.length, littleEndian);
    entries.forEach((entry, index) => {
      const offset = at + 2 + index * 12;
      view.setUint16(offset, entry.tag, littleEndian);
      view.setUint16(offset + 2, entry.type, littleEndian);
      view.setUint32(offset + 4, entry.count ?? 20, littleEndian);
      view.setUint32(offset + 8, entry.value, littleEndian);
    });
  };
  writeIfd(8, layout.ifd0);
  if (layout.exif) writeIfd(40, layout.exif);
  [...(layout.text ?? '')].forEach((character, index) =>
    view.setUint8(80 + index, character.charCodeAt(0)),
  );
  return [...new Uint8Array(view.buffer)];
}

function exifSegment(block: number[]): number[] {
  const length = block.length + 8;
  return [
    0xff,
    0xe1,
    length >> 8,
    length & 0xff,
    0x45,
    0x78,
    0x69,
    0x66,
    0,
    0,
    ...block,
  ];
}

function jpeg(...segments: number[][]): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([...SOI, ...segments.flat(), ...SCAN, ...EOI]);
}

const WHEN = '2026:09:28 14:32:05';
const dated = (timestamp: string): ShotDate => ({ kind: 'dated', timestamp });

describe('readShotDate', () => {
  it('reads DateTimeOriginal from the Exif IFD, little- and big-endian', () => {
    for (const littleEndian of [true, false]) {
      const block = tiff(littleEndian, {
        ifd0: [{ tag: 0x8769, type: 4, value: 40, count: 1 }],
        exif: [{ tag: 0x9003, type: 2, value: 80 }],
        text: WHEN,
      });
      expect(readShotDate(jpeg(JFIF, exifSegment(block)))).toEqual(dated(WHEN));
    }
  });

  it('prefers DateTimeOriginal to DateTime, and falls back to DateTime', () => {
    const both = tiff(true, {
      ifd0: [
        { tag: 0x0132, type: 2, value: 100 },
        { tag: 0x8769, type: 4, value: 40, count: 1 },
      ],
      exif: [{ tag: 0x9003, type: 2, value: 80 }],
      text: WHEN,
    });
    expect(readShotDate(jpeg(exifSegment(both)))).toEqual(dated(WHEN));
    const brokenDateTime = tiff(true, {
      ifd0: [
        { tag: 0x0132, type: 2, value: 5000 },
        { tag: 0x8769, type: 4, value: 40, count: 1 },
      ],
      exif: [{ tag: 0x9003, type: 2, value: 80 }],
      text: WHEN,
    });
    expect(readShotDate(jpeg(exifSegment(brokenDateTime)))).toEqual(
      dated(WHEN),
    );
    const onlyDateTime = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
      text: WHEN,
    });
    expect(readShotDate(jpeg(exifSegment(onlyDateTime)))).toEqual(dated(WHEN));
    const exifWithoutOriginal = tiff(true, {
      ifd0: [
        { tag: 0x0132, type: 2, value: 80 },
        { tag: 0x8769, type: 4, value: 40, count: 1 },
      ],
      exif: [{ tag: 0x9004, type: 2, value: 100 }],
      text: WHEN,
    });
    expect(readShotDate(jpeg(exifSegment(exifWithoutOriginal)))).toEqual(
      dated(WHEN),
    );
  });

  it('skips segments before the EXIF one and an APP1 that is not EXIF', () => {
    const xmp = [0xff, 0xe1, 0, 6, 0x68, 0x74, 0x74, 0x70];
    const block = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
      text: WHEN,
    });
    expect(readShotDate(jpeg(JFIF, xmp, exifSegment(block)))).toEqual(
      dated(WHEN),
    );
  });

  it('is undated without a date, with a malformed one, or without EXIF', () => {
    const noDate = tiff(true, { ifd0: [{ tag: 0x010f, type: 2, value: 80 }] });
    expect(readShotDate(jpeg(exifSegment(noDate)))).toEqual({
      kind: 'undated',
    });
    const garbled = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
      text: '2026-09-28 14:32:05',
    });
    expect(readShotDate(jpeg(exifSegment(garbled)))).toEqual({
      kind: 'undated',
    });
    for (const text of [' 026:09:28 14:32:05', '2026:09:28 14:32:5 ']) {
      const short = tiff(true, {
        ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
        text,
      });
      expect(readShotDate(jpeg(exifSegment(short)))).toEqual({
        kind: 'undated',
      });
    }
    expect(readShotDate(jpeg(JFIF))).toEqual({ kind: 'undated' });
  });

  it('stops at the image data: EXIF after the start of scan is not looked at', () => {
    const block = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
      text: WHEN,
    });
    const late = Uint8Array.from([
      ...SOI,
      ...SCAN,
      ...exifSegment(block),
      ...EOI,
    ]);
    expect(readShotDate(late)).toEqual({ kind: 'undated' });
  });

  it('reads only as many entries as the IFD counts', () => {
    // IFD0 counts no entry; a DateTime entry right after it must not be read.
    const block = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
      text: WHEN,
    });
    block[8] = 0;
    expect(readShotDate(jpeg(exifSegment(block)))).toEqual({
      kind: 'undated',
    });
  });

  it('looks only at APP1 segments that open with the whole EXIF header', () => {
    const block = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
      text: WHEN,
    });
    const app2 = exifSegment(block);
    app2[1] = 0xe2;
    expect(readShotDate(jpeg(app2))).toEqual({ kind: 'undated' });
    // "E" and two zeros share bytes with the header but are not it.
    const almost = [0xff, 0xe1, 0, 8, 0x45, 0, 0, 0, 0, 0];
    expect(readShotDate(jpeg(almost, exifSegment(block)))).toEqual(dated(WHEN));
  });

  it('stops at the first byte that does not start a segment', () => {
    const block = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
      text: WHEN,
    });
    // Two padding bytes, then what would read as a 2-byte segment leading to the EXIF one.
    const padded = Uint8Array.from([
      ...SOI,
      0,
      0,
      0,
      2,
      ...exifSegment(block),
      ...EOI,
    ]);
    expect(readShotDate(padded)).toEqual({ kind: 'undated' });
  });

  it('needs both bytes of the start-of-image marker', () => {
    const block = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
      text: WHEN,
    });
    for (const start of [
      [0x00, 0xd8],
      [0xff, 0x00],
    ]) {
      const bytes = Uint8Array.from([...start, ...exifSegment(block), ...EOI]);
      expect(readShotDate(bytes)).toEqual({ kind: 'undated' });
    }
  });

  it('is undated for anything that is not a JPEG', () => {
    expect(readShotDate(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toEqual({
      kind: 'undated',
    });
    expect(readShotDate(Uint8Array.from([0xff, 0x00]))).toEqual({
      kind: 'undated',
    });
  });

  it('never throws on a truncated or lying file', () => {
    const block = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 80 }],
      text: WHEN,
    });
    const whole = jpeg(exifSegment(block));
    fc.assert(
      fc.property(fc.integer({ min: 0, max: whole.length }), (length) => {
        const shot = readShotDate(whole.subarray(0, length));
        expect(['dated', 'undated']).toContain(shot.kind);
      }),
    );
    const pointingAway = tiff(true, {
      ifd0: [{ tag: 0x0132, type: 2, value: 5000 }],
      text: WHEN,
    });
    expect(readShotDate(jpeg(exifSegment(pointingAway)))).toEqual({
      kind: 'undated',
    });
  });
});

describe('withShotDate', () => {
  it('writes a date the reader finds again, after the JFIF header', () => {
    const plain = jpeg(JFIF);
    const stamped = withShotDate(plain, dated(WHEN));
    expect(readShotDate(stamped)).toEqual(dated(WHEN));
    expect(Array.from(stamped.subarray(0, 2 + JFIF.length))).toEqual([
      ...SOI,
      ...JFIF,
    ]);
    expect(
      Array.from(stamped.subarray(2 + JFIF.length, 2 + JFIF.length + 2)),
    ).toEqual([0xff, 0xe1]);
    expect(Array.from(stamped.subarray(-SCAN.length - EOI.length))).toEqual([
      ...SCAN,
      ...EOI,
    ]);
  });

  it('goes straight after the start of image without a JFIF header', () => {
    const stamped = withShotDate(jpeg(), dated(WHEN));
    expect(Array.from(stamped.subarray(0, 4))).toEqual([
      0xff, 0xd8, 0xff, 0xe1,
    ]);
    expect(readShotDate(stamped)).toEqual(dated(WHEN));
  });

  it('writes the time only, in exactly this segment', () => {
    const stamped = withShotDate(jpeg(), dated(WHEN));
    const le32 = (value: number) => [value, 0, 0, 0];
    const text = [...WHEN].map((character) => character.charCodeAt(0));
    expect(Array.from(stamped.subarray(2, 2 + 86))).toEqual([
      ...[0xff, 0xe1, 0, 84, 0x45, 0x78, 0x69, 0x66, 0, 0],
      // Little-endian TIFF header, IFD0 at 8.
      ...[0x49, 0x49, 42, 0, ...le32(8)],
      // IFD0: DateTime (ASCII, 20 bytes at 56) and the Exif IFD pointer (LONG, 38); no next IFD.
      ...[2, 0, 0x32, 0x01, 2, 0, ...le32(20), ...le32(56)],
      ...[0x69, 0x87, 4, 0, ...le32(1), ...le32(38), ...le32(0)],
      // Exif IFD: DateTimeOriginal (ASCII, 20 bytes at 56); no next IFD.
      ...[1, 0, 0x03, 0x90, 2, 0, ...le32(20), ...le32(56), ...le32(0)],
      ...text,
      0,
    ]);
  });

  it('leaves anything that is not a JPEG as it is', () => {
    for (const start of [
      [0x89, 0x50],
      [0x00, 0xd8],
      [0xff, 0x00],
    ]) {
      const other = Uint8Array.from([...start, 0x4e, 0x47]);
      expect(withShotDate(other, dated(WHEN))).toBe(other);
    }
  });

  it('skips a JFIF header of any length, and only one that is there', () => {
    // An APP0 of 0x0110 bytes: the length's high byte counts too.
    const longJfif = [
      0xff,
      0xe0,
      1,
      0x10,
      ...new Array<number>(0x010e).fill(0),
    ];
    const stamped = withShotDate(jpeg(longJfif), dated(WHEN));
    expect(Array.from(stamped.subarray(2 + 0x112, 2 + 0x114))).toEqual([
      0xff, 0xe1,
    ]);
    // A byte pair that only looks like APP0 half way is not a header to skip.
    const notJfif = Uint8Array.from([...SOI, 0x00, 0xe0, 0, 4, ...EOI]);
    expect(
      Array.from(withShotDate(notJfif, dated(WHEN)).subarray(2, 4)),
    ).toEqual([0xff, 0xe1]);
  });

  it('leaves an undated image as it is', () => {
    const plain = jpeg(JFIF);
    expect(withShotDate(plain, { kind: 'undated' })).toBe(plain);
  });
});
