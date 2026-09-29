'use client';

/** The dimmed layer behind a dialog; a click on it asks to close. */
export function Backdrop({ onClick }: { onClick: () => void }) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- decorative click-outside layer; Escape and the close button carry the keyboard path
    <div
      data-testid="dialog-backdrop"
      className="fixed inset-0 z-backdrop bg-black/60 backdrop-blur-sm"
      onClick={onClick}
    />
  );
}
