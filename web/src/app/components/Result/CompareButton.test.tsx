// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { CompareButton } from './CompareButton';

beforeEach(() => {
  localStorage.setItem('lang', 'en');
});

function renderButton(pressed: boolean) {
  const onToggle = vi.fn();
  render(
    <I18nProvider>
      <CompareButton pressed={pressed} onToggle={onToggle} />
    </I18nProvider>,
  );
  return {
    onToggle,
    button: screen.getByRole('button', { name: 'Compare with one photo' }),
  };
}

describe('CompareButton', () => {
  it('is an icon button named for what it does, with a tooltip', () => {
    const { button } = renderButton(false);
    expect(button).toHaveAttribute('data-testid', 'compare-toggle');
    expect(button).toHaveAttribute('title', 'Compare with one photo');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the press and its state', async () => {
    const user = userEvent.setup();
    const { button, onToggle } = renderButton(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveClass('ring-accent');
    await user.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
