import type { DetectionDetail } from '../vision/effects/tiles';

/** What happens to what moves between the shots: nothing, a background without it, or its movement as a soft trail. */
export type MoversMode = 'off' | 'remove' | 'blur';

export const MOVERS_MODES: readonly MoversMode[] = ['off', 'remove', 'blur'];

export const DETECTION_DETAILS_IN_ORDER: readonly DetectionDetail[] = [
  'fast',
  'thorough',
];

/** The picker's choice: what to do, and how hard the movers are searched for. */
export interface MoversChoice {
  readonly mode: MoversMode;
  readonly detail: DetectionDetail;
}

/** What a burst is started with: set only when something is done about the movers. */
export interface BurstMovers {
  readonly look: 'remove' | 'blur';
  readonly detail: DetectionDetail;
}

/** The movers a burst runs with, or nothing for `off`. */
export function moversOf(choice: MoversChoice): BurstMovers | undefined {
  return choice.mode === 'off'
    ? undefined
    : { look: choice.mode, detail: choice.detail };
}
