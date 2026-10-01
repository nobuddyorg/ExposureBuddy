import type { OutputQuality } from '../vision/pipeline/budget';
import type { AlignmentStatus } from '../vision/types';
import type { DeviceProfile } from './deviceProfile';
import type { PipelineFailure } from './failure';
import type { PipelineProgress } from './runPipeline';

/** What a failed run leaves behind for a bug report: never a pixel, never a file name. */
export interface FailedRun {
  readonly photoCount: number;
  readonly quality: OutputQuality;
  /** The last progress the pipeline reported before it failed. */
  readonly progress: PipelineProgress;
  readonly failure: PipelineFailure;
}

export interface DiagnosticInput {
  readonly version: string;
  readonly userAgent: string;
  readonly device: DeviceProfile;
  readonly run: FailedRun;
}

const MEBIBYTE = 1024 * 1024;
const STATUSES: readonly AlignmentStatus[] = [
  'reference',
  'aligned',
  'blurred',
  'skipped',
  'unreadable',
  'pending',
];

/** The failure's kind with its count or engine message; a decode failure leaves out the file's name. */
function failureSummary(failure: PipelineFailure): string {
  switch (failure.kind) {
    case 'too_few_aligned':
      return `too_few_aligned (${failure.count})`;
    case 'unknown':
      return `unknown: ${failure.message}`;
    default:
      return failure.kind;
  }
}

/** A plain-text report of a failed run to paste into an issue; in English, since it is read by whoever fixes the bug. */
export function diagnosticReport(input: DiagnosticInput): string {
  const { version, userAgent, device, run } = input;
  const frameCounts = STATUSES.map(
    (status) =>
      `${status} ${run.progress.frames.filter((frame) => frame.status === status).length}`,
  );
  return [
    `ExposureBuddy ${version}`,
    `Browser: ${userAgent}`,
    `Device: ${device.poolSize} align workers, ${Math.round(device.budgetBytes / MEBIBYTE)} MiB budget`,
    `Run: ${run.photoCount} photos, ${run.quality} size, stopped at ${run.progress.stage} (${run.progress.done} of ${run.progress.total})`,
    `Frames: ${frameCounts.join(', ')}`,
    `Failure: ${failureSummary(run.failure)}`,
  ].join('\n');
}
