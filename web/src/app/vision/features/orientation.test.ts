import { describe, expect, it } from 'vitest';

import type { GrayImage } from '../types';
import { detectFastCorners } from './fast';
import { intensityCentroidAngle } from './orientation';
import {
  angleDifference,
  brightSquare,
  centerOf,
  flatGray,
  rotateGray,
  rotatePoint,
  texturedScene,
} from './synthetic.test-support';

function halfBright(brightWhere: (x: number, y: number) => boolean): GrayImage {
  const image = flatGray(64, 64, 50);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (brightWhere(x, y)) image.data[y * 64 + x] = 200;
    }
  }
  return image;
}

// Straight sum over the disc, skipping pixels outside the image.
function oracleAngle(
  image: GrayImage,
  center: { x: number; y: number },
  radius: number,
): number {
  let momentX = 0;
  let momentY = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = center.x + dx;
      const y = center.y + dy;
      const outside = x < 0 || y < 0 || x >= image.width || y >= image.height;
      if (outside || dx * dx + dy * dy > radius * radius) continue;
      momentX += dx * image.data[y * image.width + x];
      momentY += dy * image.data[y * image.width + x];
    }
  }
  return Math.atan2(momentY, momentX);
}

const center = { x: 32, y: 32 };

describe('intensityCentroidAngle', () => {
  it('points right (0) when the patch is brighter on the right', () => {
    expect(
      intensityCentroidAngle(
        halfBright((x) => x >= 32),
        center,
        10,
      ),
    ).toBeCloseTo(0, 5);
  });

  it('points down (+π/2) when the patch is brighter below', () => {
    expect(
      intensityCentroidAngle(
        halfBright((_, y) => y >= 32),
        center,
        10,
      ),
    ).toBeCloseTo(Math.PI / 2, 5);
  });

  it('points left (π) and up (−π/2) for the mirrored patches', () => {
    expect(
      intensityCentroidAngle(
        halfBright((x) => x < 32),
        center,
        10,
      ),
    ).toBeCloseTo(Math.PI, 5);
    expect(
      intensityCentroidAngle(
        halfBright((_, y) => y < 32),
        center,
        10,
      ),
    ).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('is 0 on a flat patch', () => {
    expect(
      intensityCentroidAngle(flatGray(32, 32, 90), { x: 16, y: 16 }, 8),
    ).toBe(0);
  });

  it('only weighs pixels inside the disc, so a corner of the square outside the radius has no pull', () => {
    const image = halfBright((x, y) => x >= 32 && y >= 32);
    const withinDisc = intensityCentroidAngle(image, center, 8);
    expect(withinDisc).toBeCloseTo(Math.PI / 4, 5);
  });

  it('clamps the patch at the border, weighing only the pixels that exist', () => {
    const image = halfBright((x, y) => x >= 32 || y < 8);
    for (const corner of [
      { x: 0, y: 0 },
      { x: 63, y: 63 },
      { x: 63, y: 0 },
      { x: 2, y: 60 },
    ]) {
      expect(intensityCentroidAngle(image, corner, 10)).toBeCloseTo(
        oracleAngle(image, corner, 10),
        10,
      );
    }
  });

  it('rounds a fractional centre to the nearest pixel', () => {
    const image = halfBright((x) => x >= 32);
    expect(intensityCentroidAngle(image, { x: 31.6, y: 32.4 }, 10)).toBeCloseTo(
      intensityCentroidAngle(image, { x: 32, y: 32 }, 10),
      10,
    );
  });

  it('rotates by θ when the bright square rotates by θ', () => {
    const image = brightSquare(160, 160, {
      x: 40,
      y: 40,
      width: 60,
      height: 60,
    });
    const corner = { x: 40, y: 40 };
    const before = intensityCentroidAngle(image, corner, 15);
    expect(before).toBeCloseTo(Math.PI / 4, 2);
    for (const theta of [0.5, -0.8, 2.2]) {
      const rotated = rotateGray(image, theta);
      const movedCorner = rotatePoint(corner, centerOf(image), theta);
      const after = intensityCentroidAngle(rotated, movedCorner, 15);
      expect(Math.abs(angleDifference(after, before + theta))).toBeLessThan(
        0.15,
      );
    }
  });

  it('rotates by θ at the strongest scene corners', () => {
    const scene = texturedScene(200, 200);
    const theta = 0.6;
    const rotated = rotateGray(scene, theta);
    const pivot = centerOf(scene);
    const strongest = detectFastCorners(scene, { border: 16 })
      .filter(
        (corner) => Math.hypot(corner.x - pivot.x, corner.y - pivot.y) < 60,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    expect(strongest.length).toBe(12);
    const errors = strongest.map((corner) => {
      const before = intensityCentroidAngle(scene, corner, 15);
      const after = intensityCentroidAngle(
        rotated,
        rotatePoint(corner, pivot, theta),
        15,
      );
      return Math.abs(angleDifference(after, before + theta));
    });
    const withinTolerance = errors.filter((error) => error < 0.15).length;
    expect(withinTolerance).toBeGreaterThanOrEqual(10);
  });
});
