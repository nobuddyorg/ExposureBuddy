// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Icon, type IconName } from './Icon';

const NAMES: IconName[] = ['close', 'sun', 'moon', 'monitor', 'help'];

describe('Icon', () => {
  it.each(NAMES)(
    'draws %s as at least one path, hidden from assistive tech',
    (name) => {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
    },
  );

  it('strokes in the current colour so it follows the theme', () => {
    const { container } = render(<Icon name="close" />);
    expect(container.querySelector('svg')).toHaveAttribute(
      'stroke',
      'currentColor',
    );
  });

  it('lets the caller size it through className', () => {
    const { container } = render(<Icon name="close" className="w-6 h-6" />);
    expect(container.querySelector('svg')).toHaveClass('w-6', 'h-6');
  });
});
