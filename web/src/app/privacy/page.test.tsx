// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../i18n/I18nProvider';
import Privacy from './page';

beforeEach(() => {
  localStorage.clear();
});

function renderPrivacy(lang: 'en' | 'de') {
  localStorage.setItem('lang', lang);
  render(
    <I18nProvider>
      <Privacy />
    </I18nProvider>,
  );
}

describe('Privacy', () => {
  it('says what stays on the device, what the saved image holds and what the host sees', () => {
    renderPrivacy('en');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy' }),
    ).toBeVisible();
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Your photos',
      'What stays on your device',
      'The image you save',
      'Bug reports',
      'Hosting',
    ]);
    expect(screen.getByTestId('privacy-stored')).toHaveTextContent(
      'no cookies',
    );
    expect(screen.getByTestId('privacy-saved')).toHaveTextContent(
      'no location',
    );
    expect(screen.getByTestId('privacy-hosting')).toHaveTextContent(
      'IP address',
    );
  });

  it("links GitHub's privacy statement and the way back", () => {
    renderPrivacy('en');
    const github = screen.getByRole('link', {
      name: "GitHub's privacy statement",
    });
    expect(github).toHaveAttribute(
      'href',
      'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
    );
    expect(github).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.getByRole('link', { name: 'Back to the app' }),
    ).toHaveAttribute('href', '/');
  });

  it('speaks German when the language is German', () => {
    renderPrivacy('de');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Datenschutz' }),
    ).toBeVisible();
    expect(screen.getByTestId('privacy-photos')).toHaveTextContent(
      'nicht hochgeladen',
    );
  });

  it('keeps the app chrome around it', () => {
    renderPrivacy('en');
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByTestId('privacy'),
    );
  });
});
