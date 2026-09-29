'use client';

import { useI18n } from '../../i18n/useI18n';
import {
  type ThemePreference,
  nextThemePreference,
  useTheme,
} from '../../useTheme';
import { Icon, type IconName } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';

const ICON_BY_PREFERENCE: Record<ThemePreference, IconName> = {
  system: 'monitor',
  light: 'sun',
  dark: 'moon',
};

/** One button cycling system, light and dark; its name says which is current. */
export function ThemeToggle() {
  const { t } = useI18n();
  const { preference, setThemePreference } = useTheme();
  const labels: Record<ThemePreference, string> = {
    system: t('header.theme_system'),
    light: t('header.theme_light'),
    dark: t('header.theme_dark'),
  };
  const name = `${t('header.theme')}: ${labels[preference]}`;

  return (
    <IconButton
      data-testid="theme-toggle"
      data-preference={preference}
      aria-label={name}
      title={name}
      onClick={() => setThemePreference(nextThemePreference(preference))}
    >
      <Icon name={ICON_BY_PREFERENCE[preference]} />
    </IconButton>
  );
}
