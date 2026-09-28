import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Measured, not eyeballed: low contrast in a dark palette still looks deliberate.
const css = readFileSync(new URL('globals.css', import.meta.url), 'utf8');

function tokensIn(selector: string): Record<string, string> {
  const block = css.slice(css.indexOf(selector));
  const body = block.slice(block.indexOf('{') + 1, block.indexOf('}'));
  return Object.fromEntries(
    Array.from(body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g)).map(
      ([, name, value]) => [name, value],
    ),
  );
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const themes = {
  light: tokensIn(':root {'),
  dark: tokensIn("[data-theme='dark'] {"),
};

// Every pair is type actually drawn on that surface somewhere in the app.
const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['foreground', 'muted'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'muted'],
  ['accent', 'background'],
  ['accent', 'card'],
  ['accent-foreground', 'accent'],
];

// A control's only visible edge is non-text, so WCAG 1.4.11 holds it to 3:1, not 4.5:1.
const CONTROL_BORDER_PAIRS: [string, string][] = [
  ['control-border', 'card'],
  ['control-border', 'background'],
  ['accent', 'card'],
  ['accent', 'background'],
];

describe.each(Object.entries(themes))('%s theme', (name, tokens) => {
  it('defines every colour the other theme defines', () => {
    // A token missing from one theme keeps its light value: the classic dark-mode hole.
    const other = name === 'light' ? themes.dark : themes.light;
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(other).sort());
  });

  it.each(TEXT_PAIRS)(
    'carries %s on %s at WCAG AA',
    (foreground, background) => {
      expect(tokens[foreground]).toBeDefined();
      expect(tokens[background]).toBeDefined();
      expect(
        contrast(tokens[foreground], tokens[background]),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(CONTROL_BORDER_PAIRS)(
    'carries %s on %s at WCAG AA non-text contrast',
    (foreground, background) => {
      expect(
        contrast(tokens[foreground], tokens[background]),
      ).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('the dark theme', () => {
  it('is genuinely dark, not merely dimmer than the light theme', () => {
    expect(relativeLuminance(themes.dark.background)).toBeLessThan(0.01);
    expect(relativeLuminance(themes.dark.background)).toBeLessThan(
      relativeLuminance(themes.dark.foreground),
    );
  });

  it('lifts a card off the page by making it lighter', () => {
    expect(relativeLuminance(themes.dark.card)).toBeGreaterThan(
      relativeLuminance(themes.dark.background),
    );
  });

  it('is the background the manifest and the dark theme-color meta name', () => {
    expect(themes.dark.background).toBe('#0f0e0c');
  });
});

describe('the light theme', () => {
  it('lifts a card off the paper by making it lighter', () => {
    expect(relativeLuminance(themes.light.card)).toBeGreaterThan(
      relativeLuminance(themes.light.background),
    );
  });
});

describe('the range slider', () => {
  // Each vendor draws its own pseudo-elements; a missing one shows the native widget in that browser only.
  it.each([
    '::-webkit-slider-runnable-track',
    '::-webkit-slider-thumb',
    '::-moz-range-track',
    '::-moz-range-thumb',
  ])('styles %s so every browser draws the same control', (pseudo) => {
    expect(css).toContain(`.range${pseudo}`);
  });

  it('keeps a 44px tap target', () => {
    const rule = css.slice(css.indexOf('.range {'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('height: 2.75rem');
  });
});
