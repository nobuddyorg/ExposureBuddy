import type { SVGProps } from 'react';

// One path set per icon on a 24px grid, stroked in the current colour so it follows the theme.
const ICON_PATHS = {
  close: ['M6 6l12 12', 'M18 6L6 18'],
  sun: [
    'M12 4v2',
    'M12 18v2',
    'M4 12h2',
    'M18 12h2',
    'M6.3 6.3l1.4 1.4',
    'M16.3 16.3l1.4 1.4',
    'M6.3 17.7l1.4-1.4',
    'M16.3 7.7l1.4-1.4',
    'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  ],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  monitor: ['M4 5h16v11H4z', 'M8 20h8', 'M12 16v4'],
  info: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 11v6', 'M12 7.5h.01'],
  compare: ['M4 5h16v14H4z', 'M12 5v14'],
  chevron: ['M6 9l6 6 6-6'],
  help: [
    'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
    'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7',
    'M12 17h.01',
  ],
} as const;

export type IconName = keyof typeof ICON_PATHS;

type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & { name: IconName };

/** A decorative 20px stroke icon; the control around it carries the accessible name. */
export function Icon({ name, className = 'w-5 h-5', ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      {ICON_PATHS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
