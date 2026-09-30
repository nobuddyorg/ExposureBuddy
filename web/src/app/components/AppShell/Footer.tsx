'use client';

import { useI18n } from '../../i18n/useI18n';

const SOURCE_URL = 'https://github.com/nobuddyorg/ExposureBuddy';

/** The privacy line every screen ends with, and the link to the source. */
export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-border pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-sm text-muted-foreground">
        <p data-testid="footer-privacy">{t('footer.privacy')}</p>
        <a
          href={SOURCE_URL}
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center underline decoration-control-border underline-offset-4 hover:text-foreground"
        >
          {t('footer.source')}
        </a>
      </div>
    </footer>
  );
}
