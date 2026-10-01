'use client';

import { APP_VERSION } from '../../appVersion';
import { useI18n } from '../../i18n/useI18n';
import Dialog from '../ui/Dialog';

const HELP_TEST_IDS = { dialog: 'help-dialog', close: 'help-close' };

/** The help dialog: what the app does, how to shoot, the sliders, privacy; opened by the header or Ctrl+/. */
export default function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  // Spelled out, not built from the id: the i18n parity test only sees literal t('…') keys.
  const topics = [
    { id: 'what', title: t('help.what_title'), body: t('help.what_body') },
    { id: 'shoot', title: t('help.shoot_title'), body: t('help.shoot_body') },
    {
      id: 'sliders',
      title: t('help.sliders_title'),
      body: t('help.sliders_body'),
    },
    {
      id: 'privacy',
      title: t('help.privacy_title'),
      body: t('help.privacy_body'),
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('help.title')}
      closeLabel={t('help.close')}
      testIds={HELP_TEST_IDS}
    >
      <div className="space-y-5">
        {topics.map((topic) => (
          <section key={topic.id} data-testid={`help-topic-${topic.id}`}>
            <h3 className="font-display mb-1 text-sm font-semibold">
              {topic.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {topic.body}
            </p>
          </section>
        ))}
        <div className="space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
          <p>{t('help.shortcut_hint', { shortcut: 'Ctrl+/ · ⌘+/' })}</p>
          <p data-testid="app-version">
            {t('help.version', { version: APP_VERSION })}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
