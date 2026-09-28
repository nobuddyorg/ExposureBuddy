import type { PipelineStage } from '../../exposure/runPipeline';
import type { useI18n } from '../../i18n/useI18n';
import type { AlignmentStatus, FrameReport } from '../../vision/types';

type Translate = ReturnType<typeof useI18n>['t'];

/** The stage as a sentence; one literal per case, so the i18n parity test sees every key. */
export function stageLabel(t: Translate, stage: PipelineStage): string {
  switch (stage) {
    case 'reference':
      return t('progress.reference');
    case 'aligning':
      return t('progress.aligning');
    case 'stacking':
      return t('progress.stacking');
    case 'compositing':
      return t('progress.compositing');
  }
}

/** What one frame's status is called. */
export function frameLabel(t: Translate, status: AlignmentStatus): string {
  switch (status) {
    case 'pending':
      return t('progress.frame_pending');
    case 'reference':
      return t('progress.frame_reference');
    case 'aligned':
      return t('progress.frame_aligned');
    case 'skipped':
      return t('progress.frame_skipped');
    case 'unreadable':
      return t('progress.frame_unreadable');
  }
}

/** The inlier count for a frame that was matched, aligned or skipped; empty for the rest. */
export function frameDetail(t: Translate, frame: FrameReport): string {
  if (frame.status !== 'aligned' && frame.status !== 'skipped') return '';
  return t('progress.frame_detail', {
    inliers: frame.inliers,
    matches: frame.matches,
  });
}

/** The bar's fill as a percentage, 0–100; a zero total is an empty bar. */
export function percentDone(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}
