'use client';

import { useI18n } from '../../i18n/useI18n';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';

// Read as a literal `process.env.NEXT_PUBLIC_X` expression, the only form Next's static export inlines.
const LOGO_SOURCE = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/logo.svg`;

/** The sticky top bar: logo and wordmark, theme and language toggles, the help button. */
export default function Header({ onOpenHelp }: { onOpenHelp: () => void }) {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-header border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image earns nothing on a static export with images.unoptimized */}
          <img
            src={LOGO_SOURCE}
            alt=""
            width={28}
            height={28}
            decoding="async"
            fetchPriority="high"
            className="h-7 w-7 shrink-0"
          />
          <span className="font-display truncate text-lg font-semibold">
            {t('brand.exposure')}
            <span className="text-accent">{t('brand.buddy')}</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeToggle />
          <LanguageToggle />
          <IconButton
            data-testid="open-help"
            aria-label={t('header.help')}
            title={t('header.help')}
            aria-keyshortcuts="Control+/ Meta+/"
            onClick={onOpenHelp}
          >
            <Icon name="help" />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
