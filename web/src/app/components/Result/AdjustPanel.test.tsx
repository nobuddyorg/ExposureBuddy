// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { AdjustPanel } from './AdjustPanel';

beforeEach(() => {
  localStorage.setItem('lang', 'en');
});

function renderPanel() {
  render(
    <I18nProvider>
      <AdjustPanel>
        <p>the sliders</p>
      </AdjustPanel>
    </I18nProvider>,
  );
  return {
    toggle: screen.getByRole('button', { name: 'Adjust the look' }),
    panel: screen.getByText('the sliders').parentElement as HTMLElement,
  };
}

describe('AdjustPanel', () => {
  it('starts closed on a phone; the desktop classes keep it open there', () => {
    const { toggle, panel } = renderPanel();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveClass('lg:hidden');
    expect(panel).toHaveClass('hidden', 'lg:block');
  });

  it('opens and closes with the bar and names the panel it controls', async () => {
    const user = userEvent.setup();
    const { toggle, panel } = renderPanel();
    expect(toggle).toHaveAttribute('aria-controls', panel.id);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveClass('hidden');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveClass('hidden');
  });
});
