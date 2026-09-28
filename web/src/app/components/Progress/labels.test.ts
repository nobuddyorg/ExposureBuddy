import { describe, expect, it } from 'vitest';

import type { FrameReport } from '../../vision/types';
import { frameDetail, frameLabel, percentDone, stageLabel } from './labels';

// Echoes the key with its values, so each case asserts which literal it picked.
const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length > 0 ? JSON.stringify(values) : ''}`;

function frame(overrides: Partial<FrameReport>): FrameReport {
  return { index: 0, status: 'pending', matches: 0, inliers: 0, ...overrides };
}

describe('stageLabel', () => {
  it.each([
    ['reference', 'progress.reference'],
    ['aligning', 'progress.aligning'],
    ['stacking', 'progress.stacking'],
    ['compositing', 'progress.compositing'],
  ] as const)('names the %s stage', (stage, key) => {
    expect(stageLabel(t, stage)).toBe(key);
  });
});

describe('frameLabel', () => {
  it.each([
    ['pending', 'progress.frame_pending'],
    ['reference', 'progress.frame_reference'],
    ['aligned', 'progress.frame_aligned'],
    ['skipped', 'progress.frame_skipped'],
    ['unreadable', 'progress.frame_unreadable'],
  ] as const)('names a %s frame', (status, key) => {
    expect(frameLabel(t, status)).toBe(key);
  });
});

describe('frameDetail', () => {
  it('reports inliers of matches for an aligned frame', () => {
    expect(
      frameDetail(t, frame({ status: 'aligned', matches: 200, inliers: 120 })),
    ).toBe('progress.frame_detail{"inliers":120,"matches":200}');
  });

  it('reports them for a skipped frame too', () => {
    expect(
      frameDetail(t, frame({ status: 'skipped', matches: 30, inliers: 3 })),
    ).toBe('progress.frame_detail{"inliers":3,"matches":30}');
  });

  it.each(['pending', 'reference', 'unreadable'] as const)(
    'has nothing to say about a %s frame',
    (status) => {
      expect(frameDetail(t, frame({ status, matches: 5, inliers: 5 }))).toBe(
        '',
      );
    },
  );
});

describe('percentDone', () => {
  it('rounds the fraction to a whole percentage', () => {
    expect(percentDone(1, 3)).toBe(33);
    expect(percentDone(2, 3)).toBe(67);
    expect(percentDone(3, 3)).toBe(100);
  });

  it('is empty at the start and for a zero total', () => {
    expect(percentDone(0, 5)).toBe(0);
    expect(percentDone(0, 0)).toBe(0);
  });

  it('never leaves 0–100', () => {
    expect(percentDone(7, 5)).toBe(100);
    expect(percentDone(-1, 5)).toBe(0);
  });
});
