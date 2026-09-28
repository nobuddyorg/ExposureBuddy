import { useContext } from 'react';

import { I18nContext } from './I18nProvider';

/** The active language, its `t`/`tCount` and the setter; throws outside an I18nProvider. */
export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
