/** Tailwind classes for a text input or select: 44px tall, on a card, framed by the 3:1 control edge. */
export function fieldClasses(className = ''): string {
  return `w-full min-h-11 rounded-lg px-3 bg-card text-foreground ring-1 ring-inset ring-control-border focus:ring-2 focus:ring-accent focus:outline-none ${className}`.trim();
}

/** The small caption above a control or section: uppercase, tracked, muted. */
export function labelClasses(className = ''): string {
  return `block text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground ${className}`.trim();
}

/** Classes for an `<input type="range">`: `.range` in globals.css draws one look in every browser. */
export function rangeClasses(className = ''): string {
  return `range ${className}`.trim();
}
