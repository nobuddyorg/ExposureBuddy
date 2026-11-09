import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { xfeatDetector } from '../features/xfeat/detect';
import { parseXFeatWeights } from '../features/xfeat/net';
import { applyHomography } from '../geometry/homography';
import { warpRgba } from '../warp/warp';
import { toRgba } from '../image/banded';
import type { RgbaImage } from '../types';
import { texturedScene } from '../features/synthetic.test-support';
import { alignLearned, analyseLearnedReference } from './learnedAlignment';

const bytes = readFileSync(
  new URL('../../../../public/ml/xfeat-core.bin', import.meta.url),
);
const detect = xfeatDetector(
  parseXFeatWeights(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  ),
);

const toColour = (
  width: number,
  height: number,
  data: Uint8Array,
): RgbaImage => {
  const rgba = new Uint8ClampedArray(width * height * 4);
  data.forEach((value, i) => {
    rgba[i * 4] = value;
    rgba[i * 4 + 1] = value;
    rgba[i * 4 + 2] = value;
    rgba[i * 4 + 3] = 255;
  });
  return { width, height, data: rgba };
};

// The network runs in plain TypeScript: a few seconds per picture.
const SLOW = 120_000;

describe('alignLearned', { timeout: SLOW }, () => {
  const scene = texturedScene(320, 256, 11);
  const reference = toColour(320, 256, scene.data);
  const shift = Float64Array.from([1, 0, 6.5, 0, 1, -4.25, 0, 0, 1]);
  const moved = toRgba(warpRgba(reference, shift, reference).image);
  const learned = analyseLearnedReference(reference, detect);

  it('finds keypoints in the reference at the alignment size', () => {
    expect(learned.size).toEqual({ width: 320, height: 256 });
    expect(learned.keypoints.points.length).toBeGreaterThan(30);
  });

  it("recovers a shifted frame's transform to within a pixel", () => {
    const outcome = alignLearned(moved, learned, detect);
    if (outcome.kind !== 'aligned')
      throw new Error(
        `not aligned: ${outcome.matches} matches, ${outcome.inliers} inliers`,
      );
    // The aligned frame maps the moved frame back onto the reference: shift's inverse.
    const back = applyHomography(outcome.homography, { x: 106.5, y: 60.75 });
    expect(back.x).toBeCloseTo(100, 0);
    expect(back.y).toBeCloseTo(65, 0);
    expect(outcome.inliers).toBeGreaterThanOrEqual(20);
  });

  it('skips a frame that has nothing in common with the reference', () => {
    const other = toColour(320, 256, texturedScene(320, 256, 99).data);
    const outcome = alignLearned(other, learned, detect);
    expect(outcome.kind).toBe('skipped');
  });

  it('skips a frame without texture', () => {
    const flat = toColour(320, 256, new Uint8Array(320 * 256).fill(90));
    expect(alignLearned(flat, learned, detect).kind).toBe('skipped');
  });
});
