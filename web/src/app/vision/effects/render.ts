import { dilateMask, featherMask, growRect, maskBounds } from './mask';
import { blurAlongLine } from './lineBlur';
import { displaceLayer } from './displace';
import { composeOver, liftLayer, mixByMask, type Layer } from './layer';
import { fillHole } from './inpaint';
import { fractalNoise } from './noise';
import { featureSize, liquidOffset, smokeDrift, smokeKeep } from './shapes';
import { indices } from '../indices';
import type { EffectParams } from './effectParams';
import type { GrayImage, Rect, RgbaImage } from '../types';

/** The longest the effect reaches at full strength, as a share of the photo's long edge. */
const REACH_SHARE = 0.15;
/** The feather is this share of the long edge; the hole behind the people is grown by four times that. */
const FEATHER_SHARE = 1 / 400;
const NOISE_SEEDS = { x: 1, y: 2, dissolve: 3 } as const;

/** The people lifted off a photo, with the plate that shows where they stood, ready to be rendered with any effect. */
export interface Scene {
  readonly plate: RgbaImage;
  readonly people: Layer;
  /** Where the people are, before any effect moves them. */
  readonly bounds: Rect;
}

const longEdgeOf = (image: { width: number; height: number }) =>
  Math.max(image.width, image.height);

/** How far the mask is feathered, in pixels: a share of the long edge, at least one. */
export function featherRadius(image: {
  width: number;
  height: number;
}): number {
  return Math.max(1, Math.round(longEdgeOf(image) * FEATHER_SHARE));
}

/** Splits `image` into the people under `mask` and the empty scene behind them; null when the mask is empty. */
export function prepareScene(image: RgbaImage, mask: GrayImage): Scene | null {
  const feather = featherRadius(image);
  const coverage = featherMask(mask, feather);
  const bounds = maskBounds(coverage, 0);
  if (!bounds) return null;
  // Grown by the full reach of the feather that follows, so the plate is pure fill wherever the people stood.
  const hole = dilateMask(mask, feather * 4);
  const behind = mixByMask(
    image,
    fillHole(image, hole),
    featherMask(hole, feather * 2),
  );
  return { plate: behind, people: liftLayer(image, coverage), bounds };
}

/** How far the effect reaches from the people, in pixels. */
export function reachPixels(
  strength: number,
  image: { width: number; height: number },
): number {
  return Math.round(strength * longEdgeOf(image) * REACH_SHARE);
}

function smoke(
  layer: Layer,
  region: Rect,
  reach: number,
  strength: number,
): Layer {
  const soft = blurAlongLine(layer, region, {
    angle: 0,
    length: reach,
    trailing: false,
  });
  const softer = blurAlongLine(soft, region, {
    angle: 90,
    length: reach,
    trailing: false,
  });
  const swirl = featureSize(longEdgeOf(layer), 25, 8);
  const wisp = featureSize(longEdgeOf(layer), 70, 4);
  const rising = displaceLayer(softer, region, (x, y) =>
    smokeDrift(
      reach,
      fractalNoise(x / swirl, y / swirl, NOISE_SEEDS.x),
      fractalNoise(x / swirl, y / swirl, NOISE_SEEDS.y),
    ),
  );
  // Wisps torn in the cloud: where the fine noise is low, the plate shows through.
  for (const y of indices(region.height)) {
    for (const x of indices(region.width)) {
      const px = region.x + x;
      const py = region.y + y;
      const keep = smokeKeep(
        strength,
        fractalNoise(px / wisp, py / wisp, NOISE_SEEDS.dissolve),
      );
      const offset = (py * layer.width + px) * 4;
      for (const channel of [0, 1, 2, 3]) rising.data[offset + channel] *= keep;
    }
  }
  return rising;
}

function liquid(layer: Layer, region: Rect, reach: number): Layer {
  const scale = featureSize(longEdgeOf(layer), 10, 8);
  return displaceLayer(layer, region, (x, y) =>
    liquidOffset(
      reach,
      fractalNoise(x / scale, y / scale, NOISE_SEEDS.x),
      fractalNoise(x / scale, y / scale, NOISE_SEEDS.y),
    ),
  );
}

/** `scene` rendered with `params`: the people blurred, smeared, melted or turned to smoke over the empty scene. */
export function renderScene(scene: Scene, params: EffectParams): RgbaImage {
  const reach = reachPixels(params.strength, scene.plate);
  const region = growRect(scene.bounds, Math.ceil(reach * 2), scene.plate);
  const { people } = scene;
  const moved = ((): Layer => {
    switch (params.effect) {
      case 'motion':
        return blurAlongLine(people, region, {
          angle: params.angle,
          length: reach,
          trailing: false,
        });
      case 'smear':
        return blurAlongLine(people, region, {
          angle: params.angle,
          length: reach * 1.5,
          trailing: true,
        });
      case 'liquid':
        return liquid(people, region, reach);
      case 'smoke':
        return smoke(people, region, reach, params.strength);
    }
  })();
  return composeOver(scene.plate, moved, region);
}
