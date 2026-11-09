import type { DetectionDetail } from '../vision/effects/tiles';

/** Whether, and how hard, what moves between the shots is searched for and left out of the burst's background. */
export type MoversChoice = 'off' | DetectionDetail;

export const MOVERS_CHOICES: readonly MoversChoice[] = [
  'off',
  'fast',
  'thorough',
];

/** The detection the burst runs with, or nothing for `off`. */
export function moversDetail(
  choice: MoversChoice,
): DetectionDetail | undefined {
  return choice === 'off' ? undefined : choice;
}
