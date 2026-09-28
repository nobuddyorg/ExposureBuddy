'use client';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';

import de from './de.json';
import en from './en.json';

const translations = { de, en };

export type Language = 'de' | 'en';

export const LANGUAGES: readonly Language[] = ['en', 'de'];

type TranslationValue = string | { [key: string]: TranslationValue };

type FlattenKeys<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: FlattenKeys<
        T[K],
        `${Prefix}${Prefix extends '' ? '' : '.'}${K}`
      >;
    }[keyof T & string];

export type TranslationKey = FlattenKeys<typeof en>;

/** The string at the dot-separated `key`, or undefined on any miss (unknown segment, or a sub-object). */
export function resolveTranslationKey(
  dictionary: TranslationValue,
  key: string,
): string | undefined {
  const value = key.split('.').reduce<TranslationValue | undefined>(
    (current, segment) =>
      typeof current === 'object' &&
      // eslint-disable-next-line sonarjs/different-types-comparison -- a translation JSON can carry a literal null the type has not seen
      current !== null &&
      Object.hasOwn(current, segment)
        ? current[segment]
        : undefined,
    dictionary,
  );
  return typeof value === 'string' ? value : undefined;
}

export type TranslationValues = Record<string, string | number>;

/** `template` with each `{name}` it has a value for filled in; user text lands verbatim, `$` sequences included. */
export function interpolate(
  template: string,
  values: TranslationValues,
): string {
  // A replacer function, never a replacement string: "$&" or "$'" in a file name must land as-is.
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

/** Each number in the format's digit grouping (1.000 in German, 1,000 in English); text as given. */
export function formatNumbers(
  values: TranslationValues,
  numberFormat: Intl.NumberFormat,
): TranslationValues {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      typeof value === 'number' ? numberFormat.format(value) : value,
    ]),
  );
}

/** Fills each `{name}` placeholder the template holds from `values`, numbers in the formatting locale. */
type Translate = (key: TranslationKey, values?: TranslationValues) => string;

type I18nContextType = {
  language: Language;
  /** What numbers are formatted in: the app language, in the browser's own regional form of it when it has one. */
  locale: string;
  setLanguage: (language: Language) => void;
  t: Translate;
  /** Picks `${baseKey}_one` by the locale's plural rule (German and English agree on one), else `baseKey`. */
  tCount: (baseKey: TranslationKey, count: number) => string;
};

export const I18nContext = createContext<I18nContextType | undefined>(
  undefined,
);

const LANGUAGE_STORAGE_KEY = 'lang';
const DEFAULT_LANGUAGE: Language = 'en';

function isLanguage(value: string | null): value is Language {
  return value === 'de' || value === 'en';
}

/** A stored choice, else the browser's language, else English; `LANG_INIT_SCRIPT` in layout.tsx decides the same way. */
export function pickLanguage(
  stored: string | null,
  browserLocale: string,
): Language {
  if (isLanguage(stored)) return stored;
  const browserLanguage = browserLocale.split('-')[0];
  return isLanguage(browserLanguage) ? browserLanguage : DEFAULT_LANGUAGE;
}

/** The first browser locale in `language` (de-CH keeps 1'000), else the bare language. */
export function formattingLocale(
  language: Language,
  browserLocales: readonly string[],
): string {
  return (
    browserLocales.find((locale) => locale.split('-')[0] === language) ??
    language
  );
}

/** The language the page should open in; storage that throws leaves the browser language deciding. */
function detectLanguage(): Language {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    // localStorage can throw (private browsing); the browser language still decides.
  }
  return pickLanguage(stored, navigator.language);
}

// localStorage fires `storage` only in other tabs, so a same-tab change needs its own event.
const LANGUAGE_CHANGE_EVENT = 'exposurebuddy:lang';

function subscribeLanguage(onChange: () => void) {
  window.addEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function storeLanguage(next: Language) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
}

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  // Read as an external store: hydration sees the prerendered default, the client re-renders with the detected language.
  const language = useSyncExternalStore<Language>(
    subscribeLanguage,
    detectLanguage,
    () => DEFAULT_LANGUAGE,
  );
  // t reads language through this ref so its identity survives a language change.
  const languageRef = useRef(language);
  // eslint-disable-next-line react-hooks/refs -- written during render so t never reads a stale language in this render
  languageRef.current = language;

  // Prerendered markup holds no number past 999, so the build machine's navigator cannot cause a hydration mismatch.
  const locale = useMemo(
    () => formattingLocale(language, navigator.languages),
    [language],
  );
  // Built once per language: t runs on every render, and building a format costs more than using one.
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const numberFormatRef = useRef(numberFormat);
  // eslint-disable-next-line react-hooks/refs -- written during render, as languageRef, so t formats numbers for this render's language
  numberFormatRef.current = numberFormat;

  const t = useCallback(
    (key: TranslationKey, values: TranslationValues = {}) =>
      interpolate(
        resolveTranslationKey(translations[languageRef.current], key) ?? key,
        formatNumbers(values, numberFormatRef.current),
      ),
    [],
  );

  // Keeps <html lang> and the meta description with the language, or screen readers use the wrong phonetics.
  useEffect(() => {
    document.documentElement.lang = language;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('app.description'));
  }, [language, t]);

  const tCount = useCallback((baseKey: TranslationKey, count: number) => {
    const dictionary = translations[languageRef.current];
    const category = new Intl.PluralRules(languageRef.current).select(count);
    const template =
      (category === 'one'
        ? resolveTranslationKey(dictionary, `${baseKey}_one`)
        : undefined) ??
      resolveTranslationKey(dictionary, baseKey) ??
      baseKey;
    return interpolate(
      template,
      formatNumbers({ count }, numberFormatRef.current),
    );
  }, []);

  const value = useMemo(
    () => ({ language, locale, setLanguage: storeLanguage, t, tCount }),
    [language, locale, t, tCount],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
