import { describe, expect, it } from 'vitest';

import { EFFECTS } from '../../vision/effects/effectParams';
import type { SingleStage } from '../../vision/pipeline/singleProtocol';
import {
  effectLabels,
  singleCount,
  singlePercent,
  singleStageLabel,
} from './labels';

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

describe('singleStageLabel', () => {
  it('names every stage with its own key', () => {
    const stages: SingleStage[] = ['decode', 'model', 'detect', 'prepare'];
    expect(stages.map((stage) => singleStageLabel(t, stage))).toEqual([
      'progress.decode',
      'progress.model',
      'progress.detect',
      'progress.prepare',
    ]);
  });
});

describe('effectLabels', () => {
  it('names every effect and its help with their own keys', () => {
    expect(EFFECTS.map((effect) => effectLabels(t, effect))).toEqual([
      { name: 'single.effect_motion', help: 'single.effect_motion_help' },
      { name: 'single.effect_smear', help: 'single.effect_smear_help' },
      { name: 'single.effect_liquid', help: 'single.effect_liquid_help' },
      { name: 'single.effect_smoke', help: 'single.effect_smoke_help' },
    ]);
  });
});

describe('singlePercent', () => {
  it('starts each stage where the one before ended', () => {
    const at = (stage: SingleStage) =>
      singlePercent({ stage, done: 0, total: 1 });
    expect(
      ['decode', 'model', 'detect', 'prepare'].map((s) => at(s as SingleStage)),
    ).toEqual([0, 5, 70, 90]);
  });

  it('moves through the stage as its work is done', () => {
    expect(singlePercent({ stage: 'model', done: 5, total: 10 })).toBe(38);
    expect(singlePercent({ stage: 'model', done: 10, total: 10 })).toBe(70);
    expect(singlePercent({ stage: 'detect', done: 1, total: 1 })).toBe(90);
  });

  it('holds at the start of a stage whose size is not known, and never leaves the stage', () => {
    expect(singlePercent({ stage: 'model', done: 4_000_000, total: 0 })).toBe(
      5,
    );
    expect(singlePercent({ stage: 'model', done: 20, total: 10 })).toBe(70);
    expect(singlePercent({ stage: 'model', done: -5, total: 10 })).toBe(5);
  });
});

describe('singleCount', () => {
  const MIB = 1024 * 1024;

  it('counts megabytes while the model downloads', () => {
    expect(
      singleCount(t, { stage: 'model', done: 4 * MIB, total: 17 * MIB }),
    ).toBe('progress.model_count:{"done":4,"total":17}');
  });

  it('is empty when the size is unknown or the stage is not the download', () => {
    expect(singleCount(t, { stage: 'model', done: 4 * MIB, total: 0 })).toBe(
      '',
    );
    expect(singleCount(t, { stage: 'detect', done: 0, total: 1 })).toBe('');
  });
});
