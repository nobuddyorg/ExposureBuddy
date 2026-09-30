'use client';

import { useId, useRef, type ReactNode } from 'react';

import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { useFocusTrap } from './useFocusTrap';

export type DialogTestIds = {
  /** On the `role="dialog"` element. */
  dialog: string;
  /** On the close button in the title bar. */
  close: string;
};

/** The centred (full screen on phones) panel with a titled header and a close button; mounted only while open. */
export function DialogPanel({
  title,
  closeLabel,
  onClose,
  testIds,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  testIds: DialogTestIds;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap(true, panelRef);

  return (
    // pointer-events-none lets a click beside the panel fall through to the backdrop underneath.
    <div className="pointer-events-none fixed inset-0 z-modal flex items-stretch justify-center sm:items-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testIds.dialog}
        className="fade-up card-lift pointer-events-auto flex h-dvh w-full flex-col overflow-hidden bg-card pt-[env(safe-area-inset-top)] text-foreground ring-1 ring-border sm:h-auto sm:max-h-[90dvh] sm:max-w-lg sm:rounded-2xl sm:pt-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border py-2 pr-2 pl-5">
          <h2 id={titleId} className="font-display text-base font-semibold">
            {title}
          </h2>
          <IconButton
            data-testid={testIds.close}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <Icon name="close" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
