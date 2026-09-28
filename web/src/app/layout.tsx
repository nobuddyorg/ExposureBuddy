import type { Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';

import './globals.css';
import { I18nProvider } from './i18n/I18nProvider';
import { ServiceWorkerRegistration } from './ServiceWorkerRegistration';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// No weights for the variable fonts: naming them makes next/font preload a file per weight.
const bodyFont = Inter({
  subsets: ['latin'],
  variable: '--font-body-family',
});
const displayFont = Sora({
  subsets: ['latin'],
  variable: '--font-display-family',
});

// Hand-written head tags, not Next's `metadata` export, which duplicates each tag on hydration here.
const THEME_COLORS = [
  { media: '(prefers-color-scheme: light)', color: '#f5f1e8' },
  { media: '(prefers-color-scheme: dark)', color: '#0f0e0c' },
];

// Inline and blocking on purpose: anything deferred runs after first paint, the flash this prevents.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));}catch(e){}})();`;

// Same pre-paint trick for `<html lang>`, kept in lockstep with I18nProvider's pickLanguage: stored, browser, else English.
const LANG_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('lang');var l=(s==='de'||s==='en')?s:(navigator.language||'').split('-')[0];document.documentElement.lang=(l==='de'||l==='en')?l:'en';}catch(e){}})();`;

// GitHub Pages sends no headers, so no frame-ancestors; this breaks out of a clickjacking frame instead.
const FRAMEBUST_SCRIPT = `if(window.top!==window.self){window.top.location=window.self.location;}`;

// 'unsafe-inline' is unavoidable with no server to hand out nonces; every origin is still 'self'.
const CONTENT_SECURITY_POLICY = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  // blob: and data: are the decoded photos and the rendered result; nothing else ever draws an image.
  `img-src 'self' blob: data:`,
  `connect-src 'self'`,
  `font-src 'self'`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ');

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the header and footer pad into the notch and home-indicator areas.
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable}`}
      // The pre-paint scripts write data-theme and lang before React sees them, so server and client markup differ.
      suppressHydrationWarning
    >
      <head>
        <title>ExposureBuddy</title>
        {/* I18nProvider updates this via a `meta[name="description"]` selector that must keep matching. */}
        <meta
          name="description"
          content="Turn a burst of phone photos into one long exposure, entirely in your browser."
        />
        <link rel="manifest" href={`${basePath}/site.webmanifest`} />
        <link rel="icon" href={`${basePath}/favicon.ico`} sizes="32x32" />
        <link
          rel="icon"
          href={`${basePath}/favicon-32x32.png`}
          sizes="32x32"
          type="image/png"
        />
        <link rel="icon" href={`${basePath}/logo.svg`} type="image/svg+xml" />
        <link
          rel="apple-touch-icon"
          href={`${basePath}/apple-touch-icon.png`}
        />
        {/* One per OS scheme: a meta tag can only follow the OS, not the in-app toggle. */}
        {THEME_COLORS.map(({ media, color }) => (
          <meta key={media} name="theme-color" content={color} media={media} />
        ))}
        {/* As early as possible: a CSP meta tag only covers what the document parses after it. */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={CONTENT_SECURITY_POLICY}
        />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <script dangerouslySetInnerHTML={{ __html: FRAMEBUST_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LANG_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {/* Dialogs portal to document.body, so useInertBackground can mark this wrapper inert without them. */}
        <div id="app-root">
          <ServiceWorkerRegistration />
          <I18nProvider>{children}</I18nProvider>
        </div>
      </body>
    </html>
  );
}
