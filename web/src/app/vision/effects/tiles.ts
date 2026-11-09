import { indices } from '../indices';
import type { GrayImage, Rect, RgbaImage, Size } from '../types';

const HALF = 128;

/** How hard the people are looked for: `thorough` also reads small sections of the photo, to find people far away. */
export type DetectionDetail = 'fast' | 'thorough';
export const DETECTION_DETAILS: readonly DetectionDetail[] = [
  'fast',
  'thorough',
];

/** Per detail: tile sizes as shares of the shorter side (large keep bodies whole, small find people far away) and the share of tiles that must agree. */
const DETAIL_SETTINGS: Record<
  DetectionDetail,
  { readonly shares: readonly number[]; readonly agreement: number }
> = {
  fast: { shares: [0.5, 0.3], agreement: 0.25 },
  thorough: { shares: [0.5, 0.3, 0.2, 0.14], agreement: 0.2 },
};
/** No tile is smaller than this: below it the model sees an enlarged blur. */
const MIN_TILE = 96;

/** Start positions along one axis that cover `length` (longer than `window`) with windows of `window`, half a window apart, the last flush with the end. */
function starts(length: number, window: number): number[] {
  const steps = Math.ceil((length - window) / (window / 2));
  return indices(steps + 1).map((step) =>
    Math.round((step * (length - window)) / steps),
  );
}

/** The whole photo first, then overlapping square tiles of every size over it; sizes no smaller than the photo's shorter side are left out. */
export function segmentationTiles(size: Size, detail: DetectionDetail): Rect[] {
  const shorter = Math.min(size.width, size.height);
  const sides = new Set(
    DETAIL_SETTINGS[detail].shares.map((share) =>
      Math.max(MIN_TILE, Math.round(shorter * share)),
    ),
  );
  const tiles = [...sides]
    .filter((side) => side < shorter)
    .flatMap((side) =>
      starts(size.height, side).flatMap((y) =>
        starts(size.width, side).map((x) => ({
          x,
          y,
          width: side,
          height: side,
        })),
      ),
    );
  return [{ x: 0, y: 0, ...size }, ...tiles];
}

/** The pixels of `image` inside `rect`, as an image of their own. */
export function cropImage(image: RgbaImage, rect: Rect): RgbaImage {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (const row of indices(rect.height)) {
    const from = ((rect.y + row) * image.width + rect.x) * 4;
    data.set(
      image.data.subarray(from, from + rect.width * 4),
      row * rect.width * 4,
    );
  }
  return { width: rect.width, height: rect.height, data };
}

/** How often each pixel was seen by a tile, and how often as a person. */
export interface TileVotes {
  readonly width: number;
  readonly height: number;
  readonly seen: Uint8Array;
  readonly people: Uint8Array;
}

export function emptyVotes(size: Size): TileVotes {
  const count = size.width * size.height;
  return {
    ...size,
    seen: new Uint8Array(count),
    people: new Uint8Array(count),
  };
}

/** Counts the tile at `origin`, whose mask is `part`: every pixel it covers was seen, and the set ones were seen as people. */
export function addTileVotes(
  votes: TileVotes,
  part: GrayImage,
  origin: Rect,
): void {
  for (const row of indices(part.height)) {
    for (const column of indices(part.width)) {
      const at = (origin.y + row) * votes.width + origin.x + column;
      votes.seen[at] += 1;
      if (part.data[row * part.width + column] >= HALF) votes.people[at] += 1;
    }
  }
}

/** 255 where enough of the tiles that saw a pixel found a person there (a statue one tile takes for a person is outvoted), 0 elsewhere. */
export function agreedMask(
  votes: TileVotes,
  detail: DetectionDetail,
): GrayImage {
  const { agreement } = DETAIL_SETTINGS[detail];
  return {
    width: votes.width,
    height: votes.height,
    data: Uint8Array.from(votes.seen, (seen, at) =>
      votes.people[at] > 0 && votes.people[at] >= seen * agreement ? 255 : 0,
    ),
  };
}
