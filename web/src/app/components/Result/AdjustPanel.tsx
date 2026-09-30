'use client';

import { useId, useState, type ReactNode } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { Icon } from '../ui/Icon';
import { buttonClasses } from '../ui/buttonClasses';

/** The sliders' home: always open beside the image on a desktop, behind an "Adjust the look" bar on a phone. */
export function AdjustPanel({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const panelId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        data-testid="adjust-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={buttonClasses({
          variant: 'secondary',
          className: 'w-full justify-between lg:hidden',
        })}
      >
        {t('result.adjust')}
        <Icon
          name="chevron"
          className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        id={panelId}
        className={`${open ? 'mt-3' : 'hidden'} lg:mt-0 lg:block`}
      >
        {children}
      </div>
    </div>
  );
}
