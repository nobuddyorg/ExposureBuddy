import type { EffectParams } from '../effects/effectParams';
import type { SmearSum } from '../effects/smear';
import type { DetectionDetail } from '../effects/tiles';
import type { GrayImage, Homography, RgbaImage, Size } from '../types';
import type { TrailSettings } from './trail';

/** What the detection worker says when its browser has no WebGL off the main thread; the coordinator maps it to its own failure. */
export const DETECTION_UNSUPPORTED_MESSAGE =
  'This browser has no WebGL inside a Web Worker, which the people detection needs.';

/** The steps a single photo goes through before it can be rendered, in order. */
export type SingleStage = 'decode' | 'model' | 'detect' | 'prepare';

export type SingleWorkerRequest =
  | {
      readonly type: 'single-prepare';
      readonly id: number;
      readonly file: Blob;
      /** The photo is decoded to fit this long edge. */
      readonly longEdge: number;
      /** Absolute URL of the folder the model and the Wasm runtime are served from. */
      readonly assetBase: string;
      /** How hard the people are looked for. */
      readonly detail: DetectionDetail;
    }
  | {
      readonly type: 'single-render';
      readonly id: number;
      readonly params: EffectParams;
    }
  | { readonly type: 'single-render-original'; readonly id: number }
  | {
      readonly type: 'movers-masks';
      readonly id: number;
      /** The photos of a burst, each with the transform that put it onto the reference at `working`. */
      readonly items: readonly {
        readonly file: Blob;
        readonly homography: Homography;
      }[];
      readonly working: Size;
      readonly assetBase: string;
      readonly detail: DetectionDetail;
      /** When set, a few frames also get their movers smeared along their paths at the working size; see `trail` in the answer. */
      readonly trail?: TrailSettings;
    };

export type SingleWorkerResponse =
  | {
      readonly type: 'single-progress';
      readonly id: number;
      readonly stage: SingleStage;
      /** Bytes while the model downloads, else 0 of 1 at the start of a step; `total` 0 means the size is unknown. */
      readonly done: number;
      readonly total: number;
    }
  | {
      readonly type: 'single-prepared';
      readonly id: number;
      readonly width: number;
      readonly height: number;
      /** Whether anyone was found; when not, nothing can be rendered. */
      readonly found: boolean;
    }
  | {
      readonly type: 'single-rendered';
      readonly id: number;
      readonly image: RgbaImage;
    }
  | {
      readonly type: 'movers-progress';
      readonly id: number;
      /** Photos of the burst searched so far, of `total`. */
      readonly done: number;
      readonly total: number;
    }
  | {
      readonly type: 'movers-masked';
      readonly id: number;
      /** One per item, in order, laid over the reference: 255 where a person, a vehicle or an animal was found. */
      readonly masks: readonly GrayImage[];
      /** With `trail` asked for: the smeared movers of those frames added up, at the working size. */
      readonly trail?: { readonly sum: SmearSum; readonly frames: number };
    };
