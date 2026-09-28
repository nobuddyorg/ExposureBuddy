'use client';

import { useId } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { labelClasses } from '../ui/fieldClasses';

/** The three shooting tips, numbered, one column on a phone and three side by side on a desktop. */
export function Tips() {
  const { t } = useI18n();
  const titleId = useId();
  // Spelled out, not built from an index: the i18n parity test only sees literal t('…') keys.
  const tips = [t('picker.tip_1'), t('picker.tip_2'), t('picker.tip_3')];

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className={labelClasses()}>
        {t('picker.tips_title')}
      </h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {tips.map((tip, position) => (
          <li key={tip} className="flex gap-3 text-sm leading-relaxed">
            <span
              aria-hidden="true"
              className="font-display mt-0.5 h-6 w-6 shrink-0 rounded-full bg-muted text-center text-xs leading-6 font-semibold text-accent"
            >
              {position + 1}
            </span>
            <span className="text-muted-foreground">{tip}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
