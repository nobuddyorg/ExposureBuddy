'use client';

import Link from 'next/link';

import AppShell from '../components/AppShell';
import { buttonClasses } from '../components/ui/buttonClasses';
import { useI18n } from '../i18n/useI18n';

const GITHUB_PRIVACY_URL =
  'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement';

/** What the app keeps, what it sends (nothing) and what its host sees, in the visitor's language. */
export default function Privacy() {
  const { t } = useI18n();
  // Spelled out, not built from the id: the i18n parity test only sees literal t('…') keys.
  const topics = [
    {
      id: 'photos',
      title: t('privacy.photos_title'),
      body: t('privacy.photos_body'),
    },
    {
      id: 'stored',
      title: t('privacy.stored_title'),
      body: t('privacy.stored_body'),
    },
    {
      id: 'saved',
      title: t('privacy.saved_title'),
      body: t('privacy.saved_body'),
    },
    {
      id: 'reports',
      title: t('privacy.reports_title'),
      body: t('privacy.reports_body'),
    },
    {
      id: 'hosting',
      title: t('privacy.hosting_title'),
      body: t('privacy.hosting_body'),
    },
  ];

  return (
    <AppShell>
      <article
        data-testid="privacy"
        className="fade-up mx-auto max-w-2xl space-y-6"
      >
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-4xl">
            {t('privacy.title')}
          </h1>
          <p className="text-muted-foreground">{t('privacy.intro')}</p>
        </div>
        {topics.map((topic) => (
          <section
            key={topic.id}
            data-testid={`privacy-${topic.id}`}
            className="space-y-1"
          >
            <h2 className="font-display text-lg font-semibold">
              {topic.title}
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              {topic.body}
            </p>
          </section>
        ))}
        <p>
          <a
            href={GITHUB_PRIVACY_URL}
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center underline decoration-control-border underline-offset-4 hover:text-foreground"
          >
            {t('privacy.hosting_link')}
          </a>
        </p>
        <Link
          href="/"
          prefetch={false}
          data-testid="privacy-back"
          className={buttonClasses({ variant: 'secondary' })}
        >
          {t('privacy.back')}
        </Link>
      </article>
    </AppShell>
  );
}
