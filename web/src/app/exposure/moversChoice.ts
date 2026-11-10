import type { DetectionDetail } from '../vision/effects/tiles';

/** What happens to what moves between the shots: the classic ghosts, or its movement drawn as a blur along its path. */
export type MoversMode = 'classic' | 'blur';

export const MOVERS_MODES: readonly MoversMode[] = ['classic', 'blur'];

export const DETECTION_DETAILS_IN_ORDER: readonly DetectionDetail[] = [
  'fast',
  'thorough',
];

/** What happens to people who stand about while the others move: left as they are, or blurred a little or a lot. */
export type StandingPeople = 'keep' | 'soft' | 'strong';

export const STANDING_PEOPLE_IN_ORDER: readonly StandingPeople[] = [
  'keep',
  'soft',
  'strong',
];

/** How far each choice blurs them, as a share of the picture's long edge. */
export const STANDING_BLUR: Readonly<Record<StandingPeople, number>> = {
  keep: 0,
  soft: 0.015,
  strong: 0.04,
};

/** The picker's choice: what to do, how hard the movers are searched for, and what becomes of those who stand about. */
export interface MoversChoice {
  readonly mode: MoversMode;
  readonly detail: DetectionDetail;
  readonly standing: StandingPeople;
}

/** What a burst is started with: set only for the blur, the one mode that looks for movers. */
export interface BurstMovers {
  readonly detail: DetectionDetail;
  /** How far people who stand about are blurred, as a share of the long edge; 0 leaves them. */
  readonly standingBlur: number;
}

/** The movers a burst runs with, or nothing for the classic look. */
export function moversOf(choice: MoversChoice): BurstMovers | undefined {
  return choice.mode === 'classic'
    ? undefined
    : {
        detail: choice.detail,
        standingBlur: STANDING_BLUR[choice.standing],
      };
}
