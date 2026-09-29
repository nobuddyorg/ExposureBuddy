const BUTTON_VARIANT_CLASSES = {
  // The one accent on screen: reserved for the action that moves the visitor forward.
  primary:
    'bg-accent text-accent-foreground hover:brightness-110 active:brightness-95',
  secondary:
    'bg-card text-foreground ring-1 ring-inset ring-control-border hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT_CLASSES;

// :hover ignores the disabled attribute; only pointer-events-none stops a disabled button hovering.
const CONTROL_BASE =
  'inline-flex items-center justify-center rounded-lg transition-[background-color,filter,box-shadow] disabled:pointer-events-none disabled:opacity-50';

/** Tailwind classes for a labelled control at least 44px tall, in `variant`, followed by `className`. */
export function buttonClasses({
  variant = 'primary',
  className = '',
}: { variant?: ButtonVariant; className?: string } = {}): string {
  return `${CONTROL_BASE} gap-2 min-h-11 px-5 text-sm font-medium ${BUTTON_VARIANT_CLASSES[variant]} ${className}`.trim();
}

/** Tailwind classes for a 44px square control holding one icon, in `variant`, followed by `className`. */
export function iconButtonClasses({
  variant = 'ghost',
  className = '',
}: { variant?: ButtonVariant; className?: string } = {}): string {
  return `${CONTROL_BASE} w-11 h-11 shrink-0 ${BUTTON_VARIANT_CLASSES[variant]} ${className}`.trim();
}
