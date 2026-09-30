import { indices } from '../indices';
import type { BandedRgb, Rect, RgbaImage, RowRange, Size } from '../types';

/** Rows per band: small enough that freeing band by band keeps the peak near one copy, large enough to keep the buffer count low. */
export const BAND_ROWS = 64;
const RGB = 3;
const RGBA = 4;
const OPAQUE = 255;
const EMPTY = new Uint8ClampedArray(0);

/** How many bands of `bandRows` rows cover `height` rows. */
export function bandCount(height: number, bandRows: number): number {
  return Math.ceil(height / bandRows);
}

function rowsInBand(image: Size, bandRows: number, band: number): number {
  return Math.min(bandRows, image.height - band * bandRows);
}

/** A `size` image with every band allocated and zeroed. */
export function createBandedRgb(size: Size, bandRows = BAND_ROWS): BandedRgb {
  return createBandedRows(size, { start: 0, end: size.height }, bandRows);
}

/** A `size` image with only the bands that hold rows of `rows` allocated, zeroed; the others stay empty. */
export function createBandedRows(
  size: Size,
  rows: RowRange,
  bandRows = BAND_ROWS,
): BandedRgb {
  const image = emptyBandedRgb(size, bandRows);
  const first = Math.floor(rows.start / bandRows);
  const last = Math.ceil(rows.end / bandRows);
  for (let band = first; band < last; band += 1) allocateBand(image, band);
  return image;
}

/** A `size` image whose bands are all still empty; `allocateBand` fills one in. */
export function emptyBandedRgb(size: Size, bandRows = BAND_ROWS): BandedRgb {
  const bands = Array.from(
    { length: bandCount(size.height, bandRows) },
    () => EMPTY,
  );
  return { width: size.width, height: size.height, bandRows, bands };
}

/** Allocates band `band` of `image`, zeroed, and returns it. */
export function allocateBand(
  image: BandedRgb,
  band: number,
): Uint8ClampedArray {
  const rows = rowsInBand(image, image.bandRows, band);
  const data = new Uint8ClampedArray(rows * image.width * RGB);
  image.bands[band] = data;
  return data;
}

/** Row `y` of `image` as a view of `width × 3` bytes; empty when its band has been freed. */
export function rowOf(image: BandedRgb, y: number): Uint8ClampedArray {
  const band = Math.floor(y / image.bandRows);
  const rowBytes = image.width * RGB;
  const start = (y - band * image.bandRows) * rowBytes;
  return image.bands[band].subarray(start, start + rowBytes);
}

/** Frees every band whose rows all lie above row `y`; at the image's height, every band. */
export function releaseBandsAbove(image: BandedRgb, y: number): void {
  // The last band may be short, so it lies wholly above y once y reaches the height.
  const firstKept =
    y >= image.height ? image.bands.length : Math.floor(y / image.bandRows);
  for (let band = 0; band < firstKept; band += 1) image.bands[band] = EMPTY;
}

/** Frees every band that holds no row above `y`: what is left is rows [0, y), rounded out to whole bands. */
export function releaseBandsFrom(image: BandedRgb, y: number): void {
  const firstFreed = Math.ceil(y / image.bandRows);
  for (let band = firstFreed; band < image.bands.length; band += 1)
    image.bands[band] = EMPTY;
}

/** Moves the allocated bands of `source` into `target`, which has the same size and band height; no pixel is copied. */
export function adoptBands(target: BandedRgb, source: BandedRgb): void {
  source.bands.forEach((band, index) => {
    if (band.length > 0) target.bands[index] = band;
  });
}

/** `image` without its alpha channel, cut into bands. */
export function bandedFromRgba(
  image: RgbaImage,
  bandRows = BAND_ROWS,
): BandedRgb {
  const banded = createBandedRgb(image, bandRows);
  for (const y of indices(image.height)) {
    const rowStart = y * image.width * RGBA;
    // Byte i of an RGB row is byte i + ⌊i / 3⌋ of the RGBA row: one alpha byte skipped per pixel before it.
    rowOf(banded, y).forEach((_, index, row) => {
      row[index] = image.data[rowStart + index + Math.floor(index / RGB)];
    });
  }
  return banded;
}

/** The rectangle `rect` of `image` as a new banded image. */
export function cropBanded(image: BandedRgb, rect: Rect): BandedRgb {
  const cropped = createBandedRgb(rect, image.bandRows);
  for (let y = 0; y < rect.height; y += 1) {
    const source = rowOf(image, rect.y + y);
    rowOf(cropped, y).set(
      source.subarray(rect.x * RGB, (rect.x + rect.width) * RGB),
    );
  }
  return cropped;
}

/** `image` as an opaque RGBA image, as a canvas takes it. */
export function toRgba(image: BandedRgb): RgbaImage {
  const data = new Uint8ClampedArray(image.width * image.height * RGBA);
  let target = 0;
  for (let y = 0; y < image.height; y += 1) {
    const row = rowOf(image, y);
    for (let source = 0; source < row.length; source += RGB) {
      data[target] = row[source];
      data[target + 1] = row[source + 1];
      data[target + 2] = row[source + 2];
      data[target + 3] = OPAQUE;
      target += RGBA;
    }
  }
  return { width: image.width, height: image.height, data };
}
