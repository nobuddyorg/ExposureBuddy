'use client';

import type { Language } from '../../i18n/I18nProvider';
import { useI18n } from '../../i18n/useI18n';
import { IconButton } from '../ui/IconButton';

// Language names are never translated: a visitor looking for their own language reads it in that language.
const LANGUAGE_NAMES: Record<Language, string> = {
  de: 'Deutsch',
  en: 'English',
};

/** One button showing the other language's code; pressing it switches to that language. */
export function LanguageToggle() {
  const { t, language, setLanguage } = useI18n();
  const target: Language = language === 'en' ? 'de' : 'en';
  const name = t('header.switch_language', {
    language: LANGUAGE_NAMES[target],
  });

  return (
    <IconButton
      data-testid="language-toggle"
      aria-label={name}
      title={name}
      onClick={() => setLanguage(target)}
    >
      <span className="text-xs font-semibold tracking-[0.08em]">
        {target.toUpperCase()}
      </span>
    </IconButton>
  );
}
