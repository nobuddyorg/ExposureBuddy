// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
});
