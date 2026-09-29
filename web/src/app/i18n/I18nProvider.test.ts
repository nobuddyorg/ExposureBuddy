import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  LANGUAGES,
  formatNumbers,
  formattingLocale,
  interpolate,
  pickLanguage,
  resolveTranslationKey,
} from './I18nProvider';

describe('resolveTranslationKey', () => {
  const dictionary = {
    help: { close: 'Close', nested: { deep: 'Deep value' } },
  };

  it('resolves a top-level nested key', () => {
    expect(resolveTranslationKey(dictionary, 'help.close')).toBe('Close');
  });

  it('resolves a deeply nested key', () => {
    expect(resolveTranslationKey(dictionary, 'help.nested.deep')).toBe(
      'Deep value',
    );
  });

  it('returns undefined for a missing top-level segment', () => {
    expect(resolveTranslationKey(dictionary, 'missing.key')).toBeUndefined();
  });

  it('returns undefined for a missing leaf segment', () => {
    expect(resolveTranslationKey(dictionary, 'help.missing')).toBeUndefined();
  });

  it('returns undefined when the path resolves to an object, not a string', () => {
    expect(resolveTranslationKey(dictionary, 'help.nested')).toBeUndefined();
  });

  it('returns undefined instead of throwing when a segment resolves to a string too early', () => {
    // An extra trailing segment must be a miss, not `'extra' in 'Close'` (a TypeError).
    expect(
      resolveTranslationKey(dictionary, 'help.close.extra'),
    ).toBeUndefined();
  });

  it('returns undefined for a numeric trailing segment instead of indexing into a leaf string', () => {
    // A boxed string has its characters as own properties, so a looser check would resolve this to 'C'.
    expect(resolveTranslationKey(dictionary, 'help.close.0')).toBeUndefined();
  });

  it('returns undefined instead of throwing when a segment resolves to null', () => {
    // Translation JSON bottoms out in strings; this forces past the type to reach the runtime guard.
    const withNull = { a: null } as unknown as Parameters<
      typeof resolveTranslationKey
    >[0];
    expect(resolveTranslationKey(withNull, 'a.b')).toBeUndefined();
  });

  it('stops at the first missing segment instead of matching later segments against the original dictionary', () => {
    // Without an immediate return on miss, 'b' would be re-checked against the original dictionary and resolve.
    const flatDictionary = { b: 'real-value' };
    expect(resolveTranslationKey(flatDictionary, 'missing.b')).toBeUndefined();
  });

  it('ignores an inherited property that happens to share a name', () => {
    expect(resolveTranslationKey(dictionary, 'toString')).toBeUndefined();
    expect(
      resolveTranslationKey(dictionary, 'help.constructor'),
    ).toBeUndefined();
  });
});

describe('interpolate', () => {
  it('fills each named placeholder with its value', () => {
    expect(interpolate('{n} of {total}', { n: 2, total: 7 })).toBe('2 of 7');
  });

  it('fills a placeholder every time it appears', () => {
    expect(interpolate('{name} and {name}', { name: 'Photos' })).toBe(
      'Photos and Photos',
    );
  });

  // String.replace would read these as "the match", "after the match" and "$".
  it('inserts a value exactly as given, $ sequences and all', () => {
    const value = "US$$ photos $& $' $` $1 $<x>";
    expect(interpolate('Delete "{name}"?', { name: value })).toBe(
      `Delete "${value}"?`,
    );
  });

  it('leaves a placeholder it has no value for untouched', () => {
    expect(interpolate('{name}: {count}', { name: 'Photos' })).toBe(
      'Photos: {count}',
    );
  });

  it('ignores an inherited property that happens to share a name', () => {
    expect(interpolate('{toString}', {})).toBe('{toString}');
  });

  it('inserts any text verbatim, whatever characters it holds', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        expect(interpolate('[{name}]', { name })).toBe(`[${name}]`);
      }),
    );
  });

  it('leaves a template without placeholders exactly as it is', () => {
    fc.assert(
      fc.property(
        fc.string().filter((text) => !/\{\w+\}/.test(text)),
        (template) => {
          expect(interpolate(template, { name: 'x' })).toBe(template);
        },
      ),
    );
  });
});

describe('formatNumbers', () => {
  const inLocale = (locale: string) => new Intl.NumberFormat(locale);

  it("groups a count's thousands the way the locale writes them", () => {
    expect(formatNumbers({ count: 1000 }, inLocale('de'))).toEqual({
      count: '1.000',
    });
    expect(formatNumbers({ count: 1000 }, inLocale('en-GB'))).toEqual({
      count: '1,000',
    });
    expect(formatNumbers({ count: 1234567 }, inLocale('de-CH'))).toEqual({
      count: "1'234'567",
    });
  });

  it('formats every number it is given, and a small one as it is', () => {
    expect(formatNumbers({ done: 12000, total: 7 }, inLocale('en'))).toEqual({
      done: '12,000',
      total: '7',
    });
  });

  it('leaves text exactly as given, digits and all', () => {
    expect(
      formatNumbers({ name: '10000 photos', count: 2 }, inLocale('de')),
    ).toEqual({ name: '10000 photos', count: '2' });
  });

  it('gives back nothing for nothing', () => {
    expect(formatNumbers({}, inLocale('de'))).toEqual({});
  });
});

describe('pickLanguage', () => {
  it('keeps a stored choice over the browser language', () => {
    expect(pickLanguage('en', 'de-DE')).toBe('en');
    expect(pickLanguage('de', 'en-GB')).toBe('de');
  });

  it('follows the browser language when nothing is stored', () => {
    expect(pickLanguage(null, 'en-GB')).toBe('en');
    expect(pickLanguage(null, 'de-AT')).toBe('de');
    expect(pickLanguage(null, 'de')).toBe('de');
  });

  it('falls back to English, the default, for a browser language the app does not speak', () => {
    expect(pickLanguage(null, 'fr-FR')).toBe('en');
    expect(pickLanguage(null, '')).toBe('en');
  });

  it('ignores a stored value that is not a supported language, inherited names included', () => {
    expect(pickLanguage('fr', 'de-AT')).toBe('de');
    expect(pickLanguage('toString', 'de-AT')).toBe('de');
    expect(pickLanguage('constructor', 'fr-FR')).toBe('en');
  });

  it('reads only the primary subtag, so a region named like a language does not count', () => {
    expect(pickLanguage(null, 'fr-DE')).toBe('en');
  });

  it('always answers a supported language, whatever it is given', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: null }),
        fc.string(),
        (stored, browserLocale) => {
          expect(LANGUAGES).toContain(pickLanguage(stored, browserLocale));
        },
      ),
    );
  });
});

describe('formattingLocale', () => {
  it("keeps the browser's regional form when it speaks the app language", () => {
    expect(formattingLocale('en', ['en-GB', 'de-DE'])).toBe('en-GB');
    expect(formattingLocale('de', ['en-US', 'de-CH'])).toBe('de-CH');
  });

  it('takes the first browser locale in that language', () => {
    expect(formattingLocale('en', ['fr-FR', 'en-AU', 'en-US'])).toBe('en-AU');
  });

  it('uses the bare app language when the browser does not speak it', () => {
    expect(formattingLocale('de', ['en-US'])).toBe('de');
    expect(formattingLocale('en', [])).toBe('en');
  });

  it('matches the primary subtag, not a region that shares its letters', () => {
    expect(formattingLocale('de', ['en-DE'])).toBe('de');
  });
});
