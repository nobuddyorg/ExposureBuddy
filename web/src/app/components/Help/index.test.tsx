// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import HelpDialog from './index';
import { useHelp } from './useHelp';

// jsdom keeps localStorage across a file's tests; reset so each starts from the detected language.
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
});

function renderHelp(open = true, onOpenChange = vi.fn()) {
  render(
    <I18nProvider>
      <HelpDialog open={open} onOpenChange={onOpenChange} />
    </I18nProvider>,
  );
  return { onOpenChange };
}

// The dialog as the page wires it: opened from a button and from Ctrl+/, closed by the dialog itself.
function WiredHelp() {
  const help = useHelp();
  const [count, setCount] = useState(0);
  return (
    <div id="app-root">
      <button type="button" data-testid="open-help" onClick={help.show}>
        Help
      </button>
      <button type="button" onClick={() => setCount(count + 1)}>
        other
      </button>
      <HelpDialog open={help.open} onOpenChange={help.setOpen} />
    </div>
  );
}

function renderWired() {
  render(
    <I18nProvider>
      <WiredHelp />
    </I18nProvider>,
  );
}

describe('HelpDialog', () => {
  it('renders nothing while closed', () => {
    renderHelp(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists every section by title with its text', () => {
    renderHelp();
    const dialog = screen.getByRole('dialog', {
      name: 'How ExposureBuddy works',
    });
    expect(dialog).toHaveAttribute('data-testid', 'help-dialog');
    for (const title of [
      'What it does',
      'Shooting',
      'The sliders',
      'Privacy',
    ]) {
      expect(within(dialog).getByText(title)).toBeVisible();
    }
    expect(screen.getByTestId('help-topic-privacy')).toHaveTextContent(
      'Photos never leave your device',
    );
  });

  it('tells the visitor the keyboard shortcut', () => {
    renderHelp();
    expect(screen.getByText(/Ctrl\+\//)).toBeVisible();
  });

  it('names the version this build is', () => {
    renderHelp();
    // Outside a build nothing bakes a version in.
    expect(screen.getByTestId('app-version')).toHaveTextContent('Version dev');
  });

  it('asks to close from its close button', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderHelp();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveAttribute('data-testid', 'help-close');
    await user.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('speaks German when the language is German', () => {
    localStorage.setItem('lang', 'de');
    renderHelp();
    expect(
      screen.getByRole('dialog', { name: 'So funktioniert ExposureBuddy' }),
    ).toBeVisible();
    expect(screen.getByText('Datenschutz')).toBeVisible();
  });
});

describe('HelpDialog wired to useHelp', () => {
  it('opens from the button, traps focus, closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    renderWired();

    await user.click(screen.getByTestId('open-help'));
    expect(screen.getByTestId('help-dialog')).toBeVisible();
    expect(screen.getByTestId('help-close')).toHaveFocus();

    // The close button is the only control, so Tab must come straight back to it.
    await user.tab();
    expect(screen.getByTestId('help-close')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('help-dialog')).toBeNull();
    await vi.waitFor(() =>
      expect(screen.getByTestId('open-help')).toHaveFocus(),
    );
  });

  it('opens on Ctrl+/ and closes from its own button', async () => {
    const user = userEvent.setup();
    renderWired();

    await user.keyboard('{Control>}/{/Control}');
    expect(screen.getByTestId('help-dialog')).toBeVisible();

    await user.click(screen.getByTestId('help-close'));
    expect(screen.queryByTestId('help-dialog')).toBeNull();
  });
});
