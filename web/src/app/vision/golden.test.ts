import { describe, expect, it } from 'vitest';

import {
  GOLDEN,
  GOLDEN_HOMOGRAPHIES,
  GOLDEN_TARGET,
  digest,
  noiseRgba,
  seededRandom,
} from './golden.test-support';
import { bandedFromRgba, createBandedRgb, rowOf } from './image/banded';
import { boxBlurInPlace } from './stack/boxBlur';
import { composite } from './stack/composite';
import { applyGain, estimateGain } from './stack/exposure';
import { fullCoverageRect } from './stack/stack';
import { fullSpans, stackFrames } from './stack/synthetic.test-support';
import type {
  AlignedFrame,
  BandedRgb,
  CompositeParams,
  Rect,
  StackResult,
} from './types';
import { warpRgba } from './warp/warp';

// The same inputs the digests in golden.test-support.ts were recorded from, fed through today's kernels.

function coveredDigest(frame: AlignedFrame, withCoverage: boolean): number {
  const hash = digest();
  for (let y = 0; y < GOLDEN_TARGET.height; y += 1) {
    const row = rowOf(frame.image, y);
    for (let x = 0; x < GOLDEN_TARGET.width; x += 1) {
      const covered = x >= frame.spans.start[y] && x < frame.spans.end[y];
      if (withCoverage) hash.add(covered ? 1 : 0);
      if (covered) row.subarray(x * 3, x * 3 + 3).forEach(hash.add);
    }
  }
  return hash.value();
}

function layerDigest(image: BandedRgb): number {
  const hash = digest();
  for (let y = 0; y < image.height; y += 1) rowOf(image, y).forEach(hash.add);
  return hash.value();
}

function warpedFrames(): AlignedFrame[] {
  const source = noiseRgba(41, 33, 1);
  return GOLDEN_HOMOGRAPHIES.map((homography) =>
    warpRgba(source, homography, GOLDEN_TARGET),
  );
}

const COMPOSITE_PARAMS: CompositeParams[] = [
  { background: 'median', ghostStrength: 0, ghostBlur: 0, glow: 0 },
  { background: 'median', ghostStrength: 1, ghostBlur: 0, glow: 0 },
  { background: 'trimmed', ghostStrength: 0.6, ghostBlur: 3, glow: 0.25 },
  { background: 'clipped', ghostStrength: 0.35, ghostBlur: 7, glow: 0.8 },
  { background: 'mode', ghostStrength: 0.9, ghostBlur: 20, glow: 1 },
  { background: 'median', ghostStrength: 0, ghostBlur: 5, glow: 0.5 },
];

const BIG_PARAMS: CompositeParams[] = [
  { background: 'median', ghostStrength: 0.6, ghostBlur: 4, glow: 0.25 },
  { background: 'mode', ghostStrength: 1, ghostBlur: 60, glow: 1 },
  { background: 'clipped', ghostStrength: 0.2, ghostBlur: 128, glow: 0.7 },
  { background: 'trimmed', ghostStrength: 0.5, ghostBlur: 1, glow: 0 },
];

describe('the rewritten kernels against the digests of the originals', () => {
  it('warps the same pixels over the same coverage', () => {
    expect(warpedFrames().map((frame) => coveredDigest(frame, true))).toEqual(
      GOLDEN.warp,
    );
  });

  const reference = bandedFromRgba(
    noiseRgba(GOLDEN_TARGET.width, GOLDEN_TARGET.height, 2),
  );
  const gained = warpedFrames();
  const gains = gained.map((frame) => estimateGain(frame, reference));
  gained.forEach((frame, index) => applyGain(frame, gains[index]));
  // Read before stacking below consumes the frames.
  const gainedDigests = gained.map((frame) => coveredDigest(frame, false));

  it('estimates and applies the same exposure gains', () => {
    expect(gains).toEqual(GOLDEN.gain);
    expect(gainedDigests).toEqual(GOLDEN.gained);
  });

  const frames = [
    { image: reference, spans: fullSpans(GOLDEN_TARGET) },
    ...gained,
  ];
  const rect: Rect = fullCoverageRect(
    frames.map((frame) => frame.spans),
    GOLDEN_TARGET,
  );
  const result = stackFrames(frames, { rect });

  it('crops to the same rectangle and stacks the same estimates inside it', () => {
    expect(rect).toEqual(GOLDEN.rect);
    expect({
      ...Object.fromEntries(
        Object.entries(result.backgrounds).map(([mode, layer]) => [
          mode,
          layerDigest(layer),
        ]),
      ),
      mean: layerDigest(result.mean),
    }).toEqual(GOLDEN.stack);
  });

  it('composites the same pixels for every look', () => {
    const digests = COMPOSITE_PARAMS.map((params) => {
      const hash = digest();
      composite(result, params).data.forEach(hash.add);
      return hash.value();
    });
    expect(digests).toEqual(GOLDEN.composite);
  });

  it('composites the same pixels with blur radii past the image height', () => {
    const size = { width: 64, height: 48 };
    const next = seededRandom(3);
    const layer = () => {
      const image = createBandedRgb(size);
      for (let y = 0; y < size.height; y += 1) {
        const row = rowOf(image, y);
        for (let offset = 0; offset < row.length; offset += 1)
          row[offset] = Math.floor(next() * 256);
      }
      return image;
    };
    const [median, trimmed, clipped, mode, mean] = [1, 2, 3, 4, 5].map(layer);
    const big: StackResult = {
      ...size,
      backgrounds: { median, trimmed, clipped, mode },
      mean,
      frameCount: 5,
    };
    const digests = BIG_PARAMS.map((params) => {
      const hash = digest();
      composite(big, params).data.forEach(hash.add);
      return hash.value();
    });
    expect(digests).toEqual(GOLDEN.bigComposite);
  });

  it('blurs to the same float bits', () => {
    const size = { width: 23, height: 17 };
    const next = seededRandom(7);
    const data = Float32Array.from(
      { length: size.width * size.height },
      () => Math.floor(next() * 511) - 255,
    );
    const cases = [
      [0, 3],
      [1, 3],
      [2, 1],
      [5, 3],
      [11, 3],
      [30, 3],
      [4, 0],
    ];
    const digests = cases.map(([radius, passes]) => {
      const layer = Float32Array.from(data);
      boxBlurInPlace(layer, size, radius, passes);
      const hash = digest();
      new Uint8Array(layer.buffer).forEach(hash.add);
      return hash.value();
    });
    expect(digests).toEqual(GOLDEN.blur);
  });
});
