// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ParamSlider } from './ParamSlider';

function renderSlider(
  overrides: Partial<Parameters<typeof ParamSlider>[0]> = {},
) {
  const onChange = vi.fn();
  render(
    <ParamSlider
      testId="ghost-slider"
      label="Ghosts"
      help="How visible moving things stay"
      infoLabel="About Ghosts"
      unit="%"
      value={60}
      max={100}
      disabled={false}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange };
}

describe('ParamSlider', () => {
  it('is a labelled range described by its help text', () => {
    renderSlider();
    const slider = screen.getByRole('slider', { name: 'Ghosts' });
    expect(slider).toHaveAttribute('type', 'range');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '100');
    expect(slider).toHaveAccessibleDescription(
      'How visible moving things stay',
    );
    expect(slider).toHaveAttribute('data-testid', 'ghost-slider');
  });

  it('shows the value with its unit in an output tied to the slider', () => {
    renderSlider({ value: 12, unit: 'px', max: 32 });
    const output = screen.getByRole('status');
    expect(output).toHaveTextContent('12 px');
    expect(output).toHaveAttribute('for', screen.getByRole('slider').id);
  });

  it('reports a moved thumb as a number', () => {
    const { onChange } = renderSlider();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '35' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(35);
  });

  it('can be disabled', () => {
    renderSlider({ disabled: true });
    expect(screen.getByRole('slider')).toBeDisabled();
  });

  it('hides the help text until the info button is pressed, and keeps it as the description', async () => {
    const user = userEvent.setup();
    renderSlider();
    const info = screen.getByRole('button', { name: 'About Ghosts' });
    const help = screen.getByText('How visible moving things stay');
    expect(info).toHaveAttribute('aria-expanded', 'false');
    expect(help).not.toBeVisible();
    expect(screen.getByRole('slider')).toHaveAccessibleDescription(
      'How visible moving things stay',
    );

    await user.click(info);
    expect(info).toHaveAttribute('aria-expanded', 'true');
    expect(help).toBeVisible();

    await user.click(info);
    expect(help).not.toBeVisible();
  });
});
