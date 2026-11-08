import type { useI18n } from '../../i18n/useI18n';
import type { SingleProgress } from '../../exposure/runSingle';
import type { EffectName } from '../../vision/effects/effectParams';
import type { SingleStage } from '../../vision/pipeline/singleProtocol';

type Translate = ReturnType<typeof useI18n>['t'];

/** The stage as a sentence; one literal per case, so the i18n parity test sees every key. */
export function singleStageLabel(t: Translate, stage: SingleStage): string {
  switch (stage) {
    case 'decode':
      return t('progress.decode');
    case 'model':
      return t('progress.model');
    case 'detect':
      return t('progress.detect');
    case 'prepare':
      return t('progress.prepare');
  }
}

/** The effect's name and the line on what it does. */
export function effectLabels(
  t: Translate,
  effect: EffectName,
): { readonly name: string; readonly help: string } {
  switch (effect) {
    case 'motion':
      return {
        name: t('single.effect_motion'),
        help: t('single.effect_motion_help'),
      };
    case 'smear':
      return {
        name: t('single.effect_smear'),
        help: t('single.effect_smear_help'),
      };
    case 'liquid':
      return {
        name: t('single.effect_liquid'),
        help: t('single.effect_liquid_help'),
      };
    case 'smoke':
      return {
        name: t('single.effect_smoke'),
        help: t('single.effect_smoke_help'),
      };
  }
}

// Where each stage sits on the one bar: the model download is the long wait, so it gets the widest share.
const SPANS: Record<SingleStage, readonly [number, number]> = {
  decode: [0, 5],
  model: [5, 70],
  detect: [70, 90],
  prepare: [90, 100],
};

/** The bar's fill, 0–100, across all stages; a stage whose size is unknown counts as just begun. */
export function singlePercent({ stage, done, total }: SingleProgress): number {
  const [start, end] = SPANS[stage];
  const within = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return Math.round(start + (end - start) * within);
}

const MEBIBYTE = 1024 * 1024;

/** `4 of 17 MB` while the model downloads and its size is known; empty otherwise. */
export function singleCount(t: Translate, progress: SingleProgress): string {
  if (progress.stage !== 'model' || progress.total <= 0) return '';
  return t('progress.model_count', {
    done: Math.round(progress.done / MEBIBYTE),
    total: Math.round(progress.total / MEBIBYTE),
  });
}
