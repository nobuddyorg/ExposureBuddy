'use client';

import type { ReactNode } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Header from '../Header';
import HelpDialog from '../Help';
import { useHelp } from '../Help/useHelp';
import { Footer } from './Footer';

/** The chrome around every screen: skip link, header, the main landmark holding `children`, footer, help dialog. */
export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const help = useHelp();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-overlay focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-foreground"
      >
        {t('page.skip_to_content')}
      </a>

      <Header onOpenHelp={help.show} />

      <main
        id="main-content"
        // Focusable so the skip link lands here and a closing dialog can fall back to it.
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10"
      >
        {children}
      </main>

      <Footer />
      <HelpDialog open={help.open} onOpenChange={help.setOpen} />
    </div>
  );
}
