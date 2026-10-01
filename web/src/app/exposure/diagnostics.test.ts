import { describe, expect, it } from 'vitest';

import type { FrameReport } from '../vision/types';
import { diagnosticReport, type FailedRun } from './diagnostics';

const frame = (index: number, status: FrameReport['status']): FrameReport => ({
  index,
  status,
  matches: 40,
  inliers: 30,
});

const RUN: FailedRun = {
  photoCount: 6,
  quality: 'high',
  progress: {
    stage: 'aligning',
    done: 4,
    total: 5,
    frames: [
      frame(0, 'aligned'),
      frame(1, 'skipped'),
      frame(2, 'reference'),
      frame(3, 'aligned'),
      frame(4, 'unreadable'),
      frame(5, 'pending'),
    ],
  },
  failure: { kind: 'too_few_aligned', count: 1 },
};

function report(run: Partial<FailedRun> = {}) {
  return diagnosticReport({
    version: '0.1.0 (abc1234)',
    userAgent: 'TestBrowser/1.0',
    device: { poolSize: 3, budgetBytes: 768 * 1024 * 1024 },
    run: { ...RUN, ...run },
  });
}

describe('diagnosticReport', () => {
  it('lists the version, browser, device, run, frames and failure, one per line', () => {
    expect(report().split('\n')).toEqual([
      'ExposureBuddy 0.1.0 (abc1234)',
      'Browser: TestBrowser/1.0',
      'Device: 3 align workers, 768 MiB budget',
      'Run: 6 photos, high size, stopped at aligning (4 of 5)',
      'Frames: reference 1, aligned 2, blurred 0, skipped 1, unreadable 1, pending 1',
      'Failure: too_few_aligned (1)',
    ]);
  });

  it('rounds the budget to whole mebibytes', () => {
    const text = diagnosticReport({
      version: 'v',
      userAgent: 'u',
      device: { poolSize: 1, budgetBytes: 256.6 * 1024 * 1024 },
      run: RUN,
    });
    expect(text).toContain('Device: 1 align workers, 257 MiB budget');
  });

  it('carries the engine message of an unknown failure', () => {
    expect(
      report({ failure: { kind: 'unknown', message: 'kernel exploded' } }),
    ).toMatch(/\nFailure: unknown: kernel exploded$/);
  });

  it('names the kind of any other failure, and never a file name', () => {
    expect(report({ failure: { kind: 'out_of_memory' } })).toMatch(
      /\nFailure: out_of_memory$/,
    );
    const decode = report({
      failure: { kind: 'decode_failed', name: 'IMG_0042.HEIC' },
    });
    expect(decode).toMatch(/\nFailure: decode_failed$/);
    expect(decode).not.toContain('IMG_0042');
  });
});
