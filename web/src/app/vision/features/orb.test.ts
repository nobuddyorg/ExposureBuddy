import { describe, expect, it } from 'vitest';

import { DESCRIPTOR_WORDS, type GrayImage, type Keypoint } from '../types';
import { BRIEF_PATCH_RADIUS } from './brief';
import { detectFastCorners } from './fast';
import { DEFAULT_ORB_OPTIONS, detectAndDescribe } from './orb';
import { flatGray, texturedScene } from './synthetic.test-support';

const BORDER = BRIEF_PATCH_RADIUS + 1;

function cellOf(
  keypoint: Keypoint,
  image: GrayImage,
  columns: number,
  rows: number,
): number {
  const column = Math.min(
    columns - 1,
    Math.floor((keypoint.x * columns) / image.width),
  );
  const row = Math.min(
    rows - 1,
    Math.floor((keypoint.y * rows) / image.height),
  );
  return row * columns + column;
}

function countPerCell(
  keypoints: readonly Keypoint[],
  image: GrayImage,
  columns: number,
  rows: number,
): number[] {
  const counts = new Array<number>(columns * rows).fill(0);
  for (const keypoint of keypoints)
    counts[cellOf(keypoint, image, columns, rows)] += 1;
  return counts;
}

function lowContrast(image: GrayImage): GrayImage {
  const data = Uint8Array.from(
    image.data,
    (value) => 100 + Math.round((value - 128) / 9),
  );
  return { ...image, data };
}

describe('detectAndDescribe', () => {
  const scene = texturedScene();

  it('has the documented defaults', () => {
    expect(DEFAULT_ORB_OPTIONS).toEqual({
      maxFeatures: 1000,
      fastThreshold: 20,
      minFeatures: 200,
      fallbackThreshold: 8,
      gridColumns: 8,
      gridRows: 6,
      smoothingRadius: 2,
    });
  });

  it('returns the image size, oriented keypoints and one descriptor per keypoint', () => {
    const features = detectAndDescribe(scene);
    expect(features.width).toBe(scene.width);
    expect(features.height).toBe(scene.height);
    expect(features.keypoints.length).toBeGreaterThan(30);
    expect(features.descriptors).toHaveLength(
      features.keypoints.length * DESCRIPTOR_WORDS,
    );
    expect(features.keypoints.some((keypoint) => keypoint.angle !== 0)).toBe(
      true,
    );
    expect(features.descriptors.some((word) => word !== 0)).toBe(true);
  });

  it('keeps every keypoint at least a patch radius plus one from every edge', () => {
    for (const keypoint of detectAndDescribe(scene).keypoints) {
      expect(keypoint.x).toBeGreaterThanOrEqual(BORDER);
      expect(keypoint.y).toBeGreaterThanOrEqual(BORDER);
      expect(keypoint.x).toBeLessThan(scene.width - BORDER);
      expect(keypoint.y).toBeLessThan(scene.height - BORDER);
    }
  });

  it('returns no features and an empty descriptor buffer for a flat image', () => {
    const features = detectAndDescribe(flatGray(100, 80, 128));
    expect(features.keypoints).toEqual([]);
    expect(features.descriptors).toHaveLength(0);
  });

  it('gives every non-empty grid cell its strongest corner when maxFeatures is one per cell', () => {
    const options = {
      maxFeatures: 48,
      gridColumns: 8,
      gridRows: 6,
      minFeatures: 0,
    };
    const large = texturedScene(320, 240);
    const raw = detectFastCorners(large, { threshold: 20, border: BORDER });
    const rawCounts = countPerCell(raw, large, 8, 6);
    const features = detectAndDescribe(large, options);
    const keptCounts = countPerCell(features.keypoints, large, 8, 6);
    expect(rawCounts.filter((count) => count > 0).length).toBeGreaterThan(30);
    rawCounts.forEach((rawCount, cell) => {
      expect(keptCounts[cell]).toBe(Math.min(rawCount, 1));
    });
    for (const keypoint of features.keypoints) {
      const cell = cellOf(keypoint, large, 8, 6);
      const best = Math.max(
        ...raw
          .filter((corner) => cellOf(corner, large, 8, 6) === cell)
          .map((corner) => corner.score),
      );
      expect(keypoint.score).toBe(best);
    }
  });

  it('caps each cell at ceil(maxFeatures / cells) and keeps the rest', () => {
    const options = {
      maxFeatures: 96,
      gridColumns: 4,
      gridRows: 3,
      minFeatures: 0,
    };
    const rawCounts = countPerCell(
      detectFastCorners(scene, { threshold: 20, border: BORDER }),
      scene,
      4,
      3,
    );
    const keptCounts = countPerCell(
      detectAndDescribe(scene, options).keypoints,
      scene,
      4,
      3,
    );
    rawCounts.forEach((rawCount, cell) =>
      expect(keptCounts[cell]).toBe(Math.min(rawCount, 8)),
    );
  });

  it('never returns more than maxFeatures, dropping the weakest', () => {
    const features = detectAndDescribe(scene, {
      maxFeatures: 10,
      gridColumns: 2,
      gridRows: 2,
      minFeatures: 0,
    });
    expect(features.keypoints).toHaveLength(10);
    const weakestKept = Math.min(
      ...features.keypoints.map((keypoint) => keypoint.score),
    );
    const perCellKept = detectAndDescribe(scene, {
      maxFeatures: 12,
      gridColumns: 2,
      gridRows: 2,
      minFeatures: 0,
    });
    const dropped = perCellKept.keypoints.filter(
      (keypoint) =>
        !features.keypoints.some(
          (kept) => kept.x === keypoint.x && kept.y === keypoint.y,
        ),
    );
    for (const keypoint of dropped)
      expect(keypoint.score).toBeLessThanOrEqual(weakestKept);
  });

  it('falls back to the lower threshold on a low-contrast image', () => {
    const faint = lowContrast(scene);
    const atStrictThreshold = detectFastCorners(faint, {
      threshold: 20,
      border: BORDER,
    }).length;
    const atFallback = detectFastCorners(faint, {
      threshold: 8,
      border: BORDER,
    }).length;
    expect(atStrictThreshold).toBeLessThan(200);
    expect(atFallback).toBeGreaterThan(atStrictThreshold);
    expect(detectAndDescribe(faint).keypoints).toHaveLength(atFallback);
    expect(detectAndDescribe(faint, { minFeatures: 0 }).keypoints).toHaveLength(
      atStrictThreshold,
    );
  });

  it('computes descriptors on the smoothed image', () => {
    const sharp = detectAndDescribe(scene, { smoothingRadius: 0 });
    const smooth = detectAndDescribe(scene, { smoothingRadius: 2 });
    expect(sharp.keypoints).toEqual(smooth.keypoints);
    expect(sharp.descriptors).not.toEqual(smooth.descriptors);
  });
});
