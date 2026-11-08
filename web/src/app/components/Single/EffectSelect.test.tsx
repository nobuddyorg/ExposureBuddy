// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import type { EffectName } from '../../vision/effects/effectParams';
import { EffectSelect } from './EffectSelect';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lang', 'en');
});

function renderSelect(value: EffectName, disabled = false) {
  const onChange = vi.fn();
  render(
    <I18nProvider>
      <EffectSelect value={value} disabled={disabled} onChange={onChange} />
    </I18nProvider>,
  );
  return onChange;
}

describe('EffectSelect', () => {
  it('lists the four effects by name, the chosen one selected, with its help as the description', () => {
    renderSelect('smear');
    const select = screen.getByRole('combobox', { name: 'Effect' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Motion blur',
      'Smear',
      'Liquid',
      'Smoke',
    ]);
    expect(select).toHaveValue('smear');
    expect(select).toHaveAccessibleDescription(/dragged along a line/);
  });

  it('reports the effect the visitor picks', async () => {
    const onChange = renderSelect('motion');
    await userEvent.selectOptions(screen.getByTestId('effect-select'), 'smoke');
    expect(onChange).toHaveBeenCalledWith('smoke');
  });

  it('can be disabled', () => {
    renderSelect('motion', true);
    expect(screen.getByTestId('effect-select')).toBeDisabled();
  });
});
