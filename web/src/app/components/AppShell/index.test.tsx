// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import AppShell from './index';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
});

function renderShell() {
  render(
    <I18nProvider>
      <div id="app-root">
        <AppShell>
          <p>screen body</p>
        </AppShell>
      </div>
    </I18nProvider>,
  );
}

describe('AppShell', () => {
  it('renders its children inside a focusable main landmark', () => {
    renderShell();
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    expect(main).toHaveTextContent('screen body');
  });

  it('offers a skip link to the main landmark', () => {
    renderShell();
    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toHaveAttribute('href', '#main-content');
  });

  it('shows the header, the privacy line and the source link', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeVisible();
    expect(screen.getByTestId('footer-privacy')).toHaveTextContent(
      'Your photos never leave this device.',
    );
    expect(screen.getByRole('link', { name: 'Source code' })).toHaveAttribute(
      'href',
      'https://github.com/nobuddyorg/ExposureBuddy',
    );
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('opens the help dialog from the header and closes it again', async () => {
    const user = userEvent.setup();
    renderShell();
    expect(screen.queryByTestId('help-dialog')).toBeNull();

    await user.click(screen.getByTestId('open-help'));
    expect(screen.getByTestId('help-dialog')).toBeVisible();

    await user.click(screen.getByTestId('help-close'));
    expect(screen.queryByTestId('help-dialog')).toBeNull();
  });

  it('translates the chrome when the language switches', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByTestId('language-toggle'));
    expect(screen.getByTestId('footer-privacy')).toHaveTextContent(
      'Deine Fotos verlassen dieses Gerät nicht.',
    );
    expect(
      screen.getByRole('link', { name: 'Zum Inhalt springen' }),
    ).toBeVisible();
  });
});
