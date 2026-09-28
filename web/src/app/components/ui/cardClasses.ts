/** Tailwind classes for a card surface: a step lighter than the page, hairline edge, seated by a soft shadow. */
export function cardClasses(className = ''): string {
  return `rounded-xl bg-card text-foreground ring-1 ring-border card-lift ${className}`.trim();
}
