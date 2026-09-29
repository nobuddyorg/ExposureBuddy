'use client';

import { useCallback, type ReactNode } from 'react';

import { Backdrop } from './Backdrop';
import { DialogPanel, type DialogTestIds } from './DialogPanel';
import { Portal } from './Portal';
import { useEscapeToClose } from './useEscapeToClose';
import { useInertBackground } from './useInertBackground';
import { useLockBodyScroll } from './useLockBodyScroll';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  testIds: DialogTestIds;
  children: ReactNode;
};

/** A modal dialog: portalled over an inert page, focus trapped, closed by Escape, the backdrop or its button. */
export default function Dialog({
  open,
  onOpenChange,
  title,
  closeLabel,
  testIds,
  children,
}: DialogProps) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useLockBodyScroll(open);
  useEscapeToClose(open, close);
  useInertBackground(open);

  if (!open) return null;

  return (
    <Portal>
      <Backdrop onClick={close} />
      <DialogPanel
        title={title}
        closeLabel={closeLabel}
        onClose={close}
        testIds={testIds}
      >
        {children}
      </DialogPanel>
    </Portal>
  );
}
