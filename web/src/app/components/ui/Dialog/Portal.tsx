'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Renders `children` at the end of `document.body`, outside `#app-root` and the inert it gets while a dialog is open. */
export function Portal({ children }: { children: ReactNode }) {
  // Client only: a dialog opens from client state, so the prerender never reaches this.
  return createPortal(children, document.body);
}
