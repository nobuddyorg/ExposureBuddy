import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Runs from a <script> tag before React exists, so it is asserted as raw source text, not executed.
const layout = readFileSync(new URL('layout.tsx', import.meta.url), 'utf8');

describe('the framebusting script in layout.tsx', () => {
  const script = layout.slice(
    layout.indexOf('const FRAMEBUST_SCRIPT'),
    layout.indexOf('const CONTENT_SECURITY_POLICY'),
  );

  it('compares the top frame to itself', () => {
    expect(script).toContain('window.top!==window.self');
  });

  it('breaks out by navigating the top frame, not just this one', () => {
    expect(script).toContain('window.top.location=window.self.location');
  });

  it('is rendered before the theme script, so it runs first', () => {
    const rendered = layout.indexOf('FRAMEBUST_SCRIPT }}');
    const themeRendered = layout.indexOf('THEME_INIT_SCRIPT }}');
    expect(rendered).toBeGreaterThan(-1);
    expect(rendered).toBeLessThan(themeRendered);
  });
});

describe('the language script in layout.tsx', () => {
  const script = layout.slice(
    layout.indexOf('const LANG_INIT_SCRIPT'),
    layout.indexOf('const FRAMEBUST_SCRIPT'),
  );

  it('reads the key I18nProvider writes and falls back to English, as pickLanguage does', () => {
    expect(script).toContain(`localStorage.getItem('lang')`);
    expect(script).toContain(`(l==='de'||l==='en')?l:'en'`);
  });

  it('matches the prerendered <html lang>', () => {
    expect(layout).toContain('lang="en"');
  });
});

describe('the Content-Security-Policy meta tag in layout.tsx', () => {
  const policy = layout.slice(
    layout.indexOf('const CONTENT_SECURITY_POLICY'),
    layout.indexOf('export const viewport'),
  );

  // The privacy claim in code: no origin but the app's own may ever be contacted.
  it('allows fetches to the app origin only', () => {
    expect(policy).toContain("`connect-src 'self'`,");
    expect(policy).toContain("`default-src 'self'`,");
  });

  it('allows blob: and data: images, which the decoded photos and the result are', () => {
    expect(policy).toContain("`img-src 'self' blob:`,");
  });

  it("starts workers from the app's own origin only", () => {
    expect(policy).toContain("`worker-src 'self'`,");
  });

  it("loads the document's scripts from the app's own origin only", () => {
    expect(policy).toContain("`script-src 'self' 'unsafe-inline'`,");
  });

  it('blocks plugin/object embeds outright', () => {
    expect(policy).toContain("`object-src 'none'`,");
  });

  // frame-ancestors does nothing in a meta tag; the framebusting script carries that job.
  it('does not declare frame-ancestors, which a meta tag cannot enforce', () => {
    expect(policy).not.toContain('frame-ancestors');
  });

  it('is rendered before the framebusting and theme scripts, so it covers everything that follows', () => {
    const cspRendered = layout.indexOf('httpEquiv="Content-Security-Policy"');
    const framebustRendered = layout.indexOf('FRAMEBUST_SCRIPT }}');
    expect(cspRendered).toBeGreaterThan(-1);
    expect(cspRendered).toBeLessThan(framebustRendered);
  });
});

describe('the theme-color meta tags in layout.tsx', () => {
  it('name the two page backgrounds globals.css defines', () => {
    const css = readFileSync(new URL('globals.css', import.meta.url), 'utf8');
    const light = /:root \{[^}]*--background: (#[0-9a-f]{6});/.exec(css)?.[1];
    const dark =
      /\[data-theme='dark'\] \{[^}]*--background: (#[0-9a-f]{6});/.exec(
        css,
      )?.[1];
    expect(layout).toContain(`color: '${light}'`);
    expect(layout).toContain(`color: '${dark}'`);
  });
});

describe('the referrer meta tag in layout.tsx', () => {
  it('strips the path/query on a cross-origin navigation rather than sending the full URL', () => {
    expect(layout).toContain(
      'name="referrer" content="strict-origin-when-cross-origin"',
    );
  });
});
