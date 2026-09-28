'use client';

import Link from 'next/link';

import AppShell from './components/AppShell';
import { buttonClasses } from './components/ui/buttonClasses';
import { useI18n } from './i18n/useI18n';

/** The 404 screen, inside the same chrome as the app. */
export default function NotFound() {
  const { t } = useI18n();

  return (
    <AppShell>
      <section
        data-testid="not-found"
        className="mx-auto max-w-md space-y-4 py-16 text-center"
      >
        <p className="font-display text-6xl font-semibold text-accent">
          {t('not_found.title')}
        </p>
        <p className="text-muted-foreground">{t('not_found.body')}</p>
        <Link href="/" className={buttonClasses({ variant: 'secondary' })}>
          {t('not_found.home')}
        </Link>
      </section>
    </AppShell>
  );
}
