// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, type TranslationKey } from './I18nProvider';
import { useI18n } from './useI18n';
import realEn from './en.json';

function Probe() {
  const { language, locale, setLanguage, t, tCount } = useI18n();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="locale">{locale}</span>
      <span data-testid="close">{t('help.close')}</span>
      <span data-testid="missing">
        {t('nope.not.a.real.key' as TranslationKey)}
      </span>
      <span data-testid="photos-0">{tCount('picker.count', 0)}</span>
      <span data-testid="photos-1">{tCount('picker.count', 1)}</span>
      <span data-testid="photos-2">{tCount('picker.count', 2)}</span>
      <span data-testid="no-plural-variant">{tCount('help.close', 1)}</span>
      <span data-testid="no-key-at-all">
        {tCount('nope.not.real' as TranslationKey, 1)}
      </span>
      <button type="button" onClick={() => setLanguage('en')}>
        English
      </button>
      <button type="button" onClick={() => setLanguage('de')}>
        Deutsch
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );
}

describe('I18nProvider', () => {
  let meta: HTMLMetaElement;

  beforeEach(() => {
    localStorage.clear();
    meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    document.head.appendChild(meta);
  });

  afterEach(() => {
    meta.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // The prerender and hydration both see the default, whatever the build machine or the visitor stored.
  it('renders English for the prerender before any client store has a say', () => {
    localStorage.setItem('lang', 'de');
    const html = renderToString(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(html).toContain('>en<');
    expect(html).toContain('>Close<');
  });

  it('detects a language stored from a previous visit', () => {
    localStorage.setItem('lang', 'de');
    // The other supported language, so 'de' below can only have come from storage.
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] });
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('de');
  });

  it('falls back to the browser language when nothing is stored', () => {
    vi.stubGlobal('navigator', { language: 'de-DE', languages: ['de-DE'] });
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('de');
  });

  it('falls back to English, the default, when neither storage nor the browser names a supported language', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR'] });
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('ignores a stored value that is not one of the supported languages', () => {
    localStorage.setItem('lang', 'fr');
    vi.stubGlobal('navigator', { language: 'de-DE', languages: ['de-DE'] });
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('de');
  });

  it('still follows the browser when reading the stored language throws', () => {
    localStorage.setItem('lang', 'en');
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });
    vi.stubGlobal('navigator', { language: 'de-AT', languages: ['de-AT'] });
    renderProbe();

    expect(screen.getByTestId('lang')).toHaveTextContent('de');
    getItem.mockRestore();
  });

  it("formats in the browser's regional form of the app language", () => {
    localStorage.setItem('lang', 'en');
    vi.stubGlobal('navigator', {
      language: 'de-DE',
      languages: ['de-DE', 'en-GB'],
    });
    renderProbe();

    expect(screen.getByTestId('locale').textContent).toBe('en-GB');
  });

  it('formats in the bare app language once the browser does not speak it', async () => {
    localStorage.setItem('lang', 'en');
    vi.stubGlobal('navigator', { language: 'en-GB', languages: ['en-GB'] });
    renderProbe();

    await act(async () => {
      screen.getByRole('button', { name: 'Deutsch' }).click();
    });

    expect(screen.getByTestId('locale').textContent).toBe('de');
  });

  it('persists a chosen language and reflects it immediately', async () => {
    localStorage.setItem('lang', 'en');
    renderProbe();
    expect(screen.getByTestId('close')).toHaveTextContent('Close');

    await act(async () => {
      screen.getByRole('button', { name: 'Deutsch' }).click();
    });

    expect(screen.getByTestId('lang')).toHaveTextContent('de');
    expect(screen.getByTestId('close')).toHaveTextContent('Schließen');
    expect(localStorage.getItem('lang')).toBe('de');
  });

  it('does not throw when the chosen language cannot be stored', async () => {
    localStorage.setItem('lang', 'en');
    renderProbe();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Deutsch' }).click();
    });

    // Nothing was stored, so the language stays as detected; the app itself survives.
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
  });

  it('falls back to the key itself for a translation that does not exist', () => {
    localStorage.setItem('lang', 'en');
    renderProbe();

    expect(screen.getByTestId('missing')).toHaveTextContent(
      'nope.not.a.real.key',
    );
  });

  it('keeps html lang and the meta description in sync with the active language', async () => {
    localStorage.setItem('lang', 'en');
    renderProbe();
    expect(document.documentElement.lang).toBe('en');
    expect(meta.getAttribute('content')).toBe(realEn.app.description);

    await act(async () => {
      screen.getByRole('button', { name: 'Deutsch' }).click();
    });

    expect(document.documentElement.lang).toBe('de');
    expect(meta.getAttribute('content')).toContain('Langzeitbelichtung');
  });

  it('tolerates a document with no meta description tag at all', () => {
    meta.remove();
    localStorage.setItem('lang', 'en');
    expect(() => renderProbe()).not.toThrow();
  });

  it('picks the singular form for a count of exactly one', () => {
    localStorage.setItem('lang', 'en');
    renderProbe();
    // Plain textContent equality: toHaveTextContent substring-matches, and "1 photo" is inside "1 photos".
    expect(screen.getByTestId('photos-1').textContent).toBe('1 photo');
    expect(screen.getByTestId('photos-0').textContent).toBe('0 photos');
    expect(screen.getByTestId('photos-2').textContent).toBe('2 photos');
  });

  it("writes a count's thousands in the formatting locale, and follows a language switch", async () => {
    localStorage.setItem('lang', 'en');
    vi.stubGlobal('navigator', {
      language: 'en-GB',
      languages: ['en-GB', 'de-CH'],
    });
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });

    expect(result.current.tCount('picker.count', 1000)).toBe('1,000 photos');
    expect(
      result.current.t('progress.count', { done: 1000, total: 2000 }),
    ).toBe('1,000 of 2,000');

    await act(async () => {
      result.current.setLanguage('de');
    });

    expect(result.current.tCount('picker.count', 1000)).toBe("1'000 Fotos");
  });

  it('falls back to the base key when a key has no _one plural variant', () => {
    localStorage.setItem('lang', 'en');
    renderProbe();

    expect(screen.getByTestId('no-plural-variant')).toHaveTextContent('Close');
  });

  it('falls back to the raw key when neither it nor its _one variant resolves to anything', () => {
    localStorage.setItem('lang', 'en');
    renderProbe();

    expect(screen.getByTestId('no-key-at-all')).toHaveTextContent(
      'nope.not.real',
    );
  });

  it('fills a placeholder with user text verbatim, $ sequences and all', () => {
    localStorage.setItem('lang', 'en');
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });

    expect(
      result.current.t('errors.decode_failed', { name: "US$$ $& $'" }),
    ).toBe("US$$ $& $' could not be read.");
  });

  it('leaves a template as it is when given no values', () => {
    localStorage.setItem('lang', 'en');
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });

    expect(result.current.t('errors.decode_failed')).toBe(
      '{name} could not be read.',
    );
  });

  it('reads the language that is current when called, not the one active when the closure was captured', async () => {
    localStorage.setItem('lang', 'en');
    const { result } = renderHook(() => useI18n(), {
      wrapper: I18nProvider,
    });
    const tBeforeSwitch = result.current.t;

    await act(async () => {
      result.current.setLanguage('de');
    });

    // Same function identity throughout, yet it must answer for German now, not the English it was made under.
    expect(result.current.t).toBe(tBeforeSwitch);
    expect(tBeforeSwitch('help.close')).toBe('Schließen');
  });
});
