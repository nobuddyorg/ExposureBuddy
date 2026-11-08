import type { EffectParams } from '../effects/effectParams';
import type { RgbaImage } from '../types';

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
    }
  | {
      readonly type: 'single-render';
      readonly id: number;
      readonly params: EffectParams;
    }
  | { readonly type: 'single-render-original'; readonly id: number };

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
    };
