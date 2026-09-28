// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nProvider } from './i18n/I18nProvider';
import NotFound from './not-found';

beforeEach(() => {
  localStorage.clear();
});

function renderNotFound() {
  render(
    <I18nProvider>
      <NotFound />
    </I18nProvider>,
  );
}

describe('NotFound', () => {
  it('renders the 404 text and a way home', () => {
    localStorage.setItem('lang', 'en');
    renderNotFound();
    expect(screen.getByTestId('not-found')).toHaveTextContent('404');
    expect(screen.getByText('There is nothing at this address.')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Back to the start' }),
    ).toHaveAttribute('href', '/');
  });

  it('speaks German when the language is German', () => {
    localStorage.setItem('lang', 'de');
    renderNotFound();
    expect(
      screen.getByText('Unter dieser Adresse gibt es nichts.'),
    ).toBeVisible();
  });

  it('keeps the app chrome around it', () => {
    localStorage.setItem('lang', 'en');
    renderNotFound();
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByTestId('footer-privacy')).toBeVisible();
  });
});
