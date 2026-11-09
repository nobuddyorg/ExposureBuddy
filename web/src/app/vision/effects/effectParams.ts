export const EFFECTS = ['motion', 'smear', 'liquid', 'smoke'] as const;
export type EffectName = (typeof EFFECTS)[number];

/** What the single-photo result screen drives. */
export interface EffectParams {
  readonly effect: EffectName;
  /** 0 leaves the people as they are; 1 is the strongest, widest effect. */
  readonly strength: number;
  /** Direction of the blur or smear in degrees, 0 to the right and 90 down; liquid and smoke ignore it. */
  readonly angle: number;
  /** 0 takes the people's mask as the model drew it; 1 grows it by its full radius, to cover the edges the model left out. */
  readonly grow: number;
}

export const DEFAULT_EFFECT_PARAMS: EffectParams = {
  effect: 'motion',
  strength: 0.5,
  angle: 0,
  grow: 0,
};
