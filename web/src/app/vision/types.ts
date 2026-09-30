/** Single-channel 8-bit image, row-major, no padding. */
export interface GrayImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Interleaved RGBA 8-bit image, row-major, no padding, as `ImageData` holds it. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Pixel-aligned rectangle; `x + width` and `y + height` are exclusive. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A corner with its FAST score and intensity-centroid orientation in radians. */
export interface Keypoint {
  readonly x: number;
  readonly y: number;
  readonly score: number;
  readonly angle: number;
}

/** 256-bit binary descriptors as 8 × 32-bit words per keypoint. */
export const DESCRIPTOR_WORDS = 8;

export interface FeatureSet {
  readonly width: number;
  readonly height: number;
  readonly keypoints: readonly Keypoint[];
  /** `keypoints.length * DESCRIPTOR_WORDS` words; keypoint i owns words `[i * 8, i * 8 + 8)`. */
  readonly descriptors: Uint32Array;
}

/** One query keypoint matched to one train keypoint, with their Hamming distance. */
export interface Match {
  readonly queryIndex: number;
  readonly trainIndex: number;
  readonly distance: number;
}

/**
 * 3×3 projective transform, row-major, `h[8]` normalised to 1 wherever possible.
 * Maps a point in the *source* frame to the *target* (reference) frame.
 */
export type Homography = Float64Array;

export interface RansacResult {
  readonly homography: Homography;
  /** One byte per correspondence, 1 for an inlier of the final model. */
  readonly inlierMask: Uint8Array;
  readonly inlierCount: number;
}

/**
 * Interleaved RGB 8-bit rows cut into bands of `bandRows` rows, each band its own buffer, so a band can be freed once used.
 * Band b holds rows [b·bandRows, min((b + 1)·bandRows, height)); a freed or not yet allocated band is empty.
 */
export interface BandedRgb {
  readonly width: number;
  readonly height: number;
  readonly bandRows: number;
  readonly bands: Uint8ClampedArray[];
}

/** Per row y, the covered columns are [start[y], end[y]); a row with end ≤ start covers nothing. */
export interface RowSpans {
  readonly start: Int32Array;
  readonly end: Int32Array;
}

/** A frame warped into the reference frame; only the pixels inside `spans` came from real source data. */
export interface AlignedFrame {
  readonly image: BandedRgb;
  readonly spans: RowSpans;
}

/** How the static scene is estimated per pixel from the frames covering it. */
export const BACKGROUND_MODES = [
  'median',
  'trimmed',
  'clipped',
  'mode',
] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

/** Per-pixel statistics over the aligned frames inside the crop every frame covers; the crop is the whole result. */
export interface StackResult {
  readonly width: number;
  readonly height: number;
  /** Every estimate of the static scene by mode; `median` is the per-channel median. */
  readonly backgrounds: Readonly<Record<BackgroundMode, BandedRgb>>;
  /** Per-channel mean over the frames: the long exposure, ghosts included. */
  readonly mean: BandedRgb;
  readonly frameCount: number;
}

/** What the sliders on the result screen drive; every value is 0–1 except the blur radius in pixels. */
export interface CompositeParams {
  /** Which estimate of the static scene the ghosts are measured against. */
  readonly background: BackgroundMode;
  /** 0 keeps only the static scene; 1 is the plain average, moving things fully ghosted. */
  readonly ghostStrength: number;
  /** Radius in pixels of the blur smeared over the moving parts. */
  readonly ghostBlur: number;
  /** Bloom added where moving things were brighter than the scene, like light trails. */
  readonly glow: number;
}

/** `pending` until the frame is looked at; `unreadable` when it could not be decoded at all. */
export type AlignmentStatus =
  'pending' | 'reference' | 'aligned' | 'skipped' | 'unreadable';

/** What one frame contributed, shown per photo on the progress and result screens. */
export interface FrameReport {
  readonly index: number;
  readonly status: AlignmentStatus;
  readonly matches: number;
  readonly inliers: number;
}
