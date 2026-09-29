// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import Header from './index';

// jsdom keeps localStorage across a file's tests; reset so each starts from the detected language and theme.
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function renderHeader(onOpenHelp = vi.fn()) {
  render(
    <I18nProvider>
      <Header onOpenHelp={onOpenHelp} />
    </I18nProvider>,
  );
  return { onOpenHelp };
}

describe('Header', () => {
  it('renders the wordmark with the accent on "Buddy"', () => {
    renderHeader();
    expect(screen.getByText('Exposure')).toBeVisible();
    expect(screen.getByText('Buddy').className).toContain('text-accent');
  });

  it('names its three controls for assistive tech', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Theme: System' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Switch to Deutsch' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Help' })).toBeVisible();
  });

  it('carries the test ids the e2e suite touches', () => {
    renderHeader();
    expect(screen.getByTestId('theme-toggle')).toBeVisible();
    expect(screen.getByTestId('language-toggle')).toBeVisible();
    expect(screen.getByTestId('open-help')).toBeVisible();
  });

  it('opens the help from its button', async () => {
    const user = userEvent.setup();
    const { onOpenHelp } = renderHeader();
    await user.click(screen.getByTestId('open-help'));
    expect(onOpenHelp).toHaveBeenCalledOnce();
  });

  it('announces the keyboard shortcut on the help button', () => {
    renderHeader();
    expect(screen.getByTestId('open-help')).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+/ Meta+/',
    );
  });

  it('loads the logo from the public root by default', () => {
    const { container } = render(
      <I18nProvider>
        <Header onOpenHelp={vi.fn()} />
      </I18nProvider>,
    );
    expect(container.querySelector('img')).toHaveAttribute('src', '/logo.svg');
  });
});

describe('the theme toggle', () => {
  it('cycles system, light, dark and back, persisting each explicit choice', async () => {
    const user = userEvent.setup();
    renderHeader();
    const toggle = screen.getByTestId('theme-toggle');

    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('Theme: Light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('Theme: Dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('Theme: System');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('starts from the stored preference', () => {
    localStorage.setItem('theme', 'dark');
    renderHeader();
    expect(screen.getByTestId('theme-toggle')).toHaveAccessibleName(
      'Theme: Dark',
    );
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute(
      'data-preference',
      'dark',
    );
  });

  it('speaks German when the language is German', () => {
    localStorage.setItem('lang', 'de');
    renderHeader();
    expect(screen.getByTestId('theme-toggle')).toHaveAccessibleName(
      'Design: System',
    );
  });
});

describe('the language toggle', () => {
  it('switches the dictionary, <html lang> and its own label', async () => {
    const user = userEvent.setup();
    renderHeader();
    const toggle = screen.getByTestId('language-toggle');
    expect(toggle).toHaveTextContent('DE');

    await user.click(toggle);

    expect(document.documentElement.lang).toBe('de');
    expect(localStorage.getItem('lang')).toBe('de');
    expect(toggle).toHaveTextContent('EN');
    expect(toggle).toHaveAccessibleName('Auf English umschalten');
    expect(screen.getByRole('button', { name: 'Hilfe' })).toBeVisible();

    await user.click(toggle);
    expect(document.documentElement.lang).toBe('en');
    expect(toggle).toHaveTextContent('DE');
  });
});
