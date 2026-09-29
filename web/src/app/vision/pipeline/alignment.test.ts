import { describe, expect, it } from 'vitest';

import { flatGray, texturedScene } from '../features/synthetic.test-support';
import { identityHomography } from '../geometry/homography';
import type { RansacResult } from '../types';
import {
  MIN_INLIERS,
  MIN_INLIER_RATIO,
  alignToReference,
  explainsEnough,
  referenceFeatures,
} from './alignment';
import { toRgba } from './images.test-support';

const image = toRgba(texturedScene(200, 150, 3));
const reference = referenceFeatures(image);

function fit(inlierCount: number, scale = 1): RansacResult {
  const homography = identityHomography();
  homography[0] = scale;
  homography[4] = scale;
  return { homography, inlierMask: new Uint8Array(0), inlierCount };
}

describe('explainsEnough', () => {
  it('needs the minimum count and the minimum share, both inclusive', () => {
    expect(explainsEnough(MIN_INLIERS, MIN_INLIERS / MIN_INLIER_RATIO)).toBe(
      true,
    );
    expect(explainsEnough(MIN_INLIERS - 1, MIN_INLIERS - 1)).toBe(false);
    expect(
      explainsEnough(MIN_INLIERS, MIN_INLIERS / MIN_INLIER_RATIO + 1),
    ).toBe(false);
    expect(explainsEnough(MIN_INLIERS + 5, MIN_INLIERS + 5)).toBe(true);
  });
});

describe('alignToReference', () => {
  it('skips a frame with nothing to match, without estimating anything', () => {
    const flat = toRgba(flatGray(200, 150, 128));
    const outcome = alignToReference(flat, reference, {
      estimate: () => {
        throw new Error('must not be reached');
      },
    });
    expect(outcome).toEqual({ kind: 'skipped', matches: 0, inliers: 0 });
  });
});

describe('alignToReference with an injected fit', () => {
  it('skips the frame when no model can be estimated', () => {
    const outcome = alignToReference(image, reference, {
      estimate: () => null,
    });
    expect(outcome.kind).toBe('skipped');
    expect(outcome.matches).toBeGreaterThan(MIN_INLIERS);
    expect(outcome.inliers).toBe(0);
  });

  it('skips the frame when the model explains too few matches', () => {
    const outcome = alignToReference(image, reference, {
      estimate: () => fit(MIN_INLIERS - 1),
    });
    expect(outcome).toMatchObject({
      kind: 'skipped',
      inliers: MIN_INLIERS - 1,
    });
  });

  it('skips the frame when the inliers are too small a share of the matches', () => {
    const outcome = alignToReference(image, reference, {
      estimate: () => fit(MIN_INLIERS),
    });
    // The premise: enough inliers in absolute terms, too few relative to the matches.
    expect(MIN_INLIERS).toBeLessThan(MIN_INLIER_RATIO * outcome.matches);
    expect(outcome).toMatchObject({ kind: 'skipped', inliers: MIN_INLIERS });
  });

  it('skips the frame when the model is not a plausible burst motion', () => {
    const outcome = alignToReference(image, reference, {
      estimate: (source) => fit(source.length, 3),
    });
    expect(outcome).toMatchObject({ kind: 'skipped' });
    expect(outcome.inliers).toBe(outcome.matches);
  });

  it('warps the frame with a model that explains the matches', () => {
    const outcome = alignToReference(image, reference, {
      estimate: (source) => fit(source.length),
    });
    expect(outcome.kind).toBe('aligned');
    if (outcome.kind !== 'aligned') throw new Error('unreachable');
    expect(outcome.frame.image.data).toEqual(image.data);
    expect(outcome.frame.coverage.every((value) => value === 1)).toBe(true);
  });
});
