'use client';

import { useI18n } from '../../i18n/useI18n';
import type { AlignmentStatus, FrameReport } from '../../vision/types';
import { frameDetail, frameLabel } from './labels';

// Pending is quiet, the reference and aligned frames carry the accent, a lost frame is struck through.
const STATUS_CLASSES: Record<AlignmentStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  reference: 'bg-card text-accent ring-1 ring-inset ring-accent',
  aligned: 'bg-accent text-accent-foreground',
  blurred:
    'bg-card text-muted-foreground ring-1 ring-inset ring-control-border line-through',
  skipped:
    'bg-card text-muted-foreground ring-1 ring-inset ring-control-border line-through',
  unreadable:
    'bg-card text-muted-foreground ring-1 ring-inset ring-control-border line-through',
};

/** One photo's fate as a pill: its 1-based number, its status, and the match count on hover or for a screen reader. */
export function FrameChip({ frame }: { frame: FrameReport }) {
  const { t } = useI18n();
  const detail = frameDetail(t, frame);

  return (
    <li
      data-testid="frame-status"
      data-status={frame.status}
      title={detail === '' ? undefined : detail}
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs ${STATUS_CLASSES[frame.status]}`}
    >
      <span className="font-display font-semibold tabular-nums">
        {frame.index + 1}
      </span>
      <span>{frameLabel(t, frame.status)}</span>
      {detail !== '' && <span className="sr-only">{detail}</span>}
    </li>
  );
}
