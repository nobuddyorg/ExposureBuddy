import { describe, expect, it } from 'vitest';

import { toManifest } from './precache-manifest.mjs';

describe('toManifest', () => {
  it('keeps the hashed bundle, the worker chunks included, and nothing else the export ships', () => {
    expect(
      toManifest([
        'index.html',
        'sw.js',
        'site.webmanifest',
        'logo.svg',
        '404/index.html',
        '_next/static/chunks/abc123.js',
        '_next/static/chunks/turbopack-worker-def456.js',
        '_next/static/chunks/ghi789.css',
        '_next/static/media/font.woff2',
        '_next/static/BUILD/_buildManifest.js',
      ]),
    ).toEqual([
      '_next/static/BUILD/_buildManifest.js',
      '_next/static/chunks/abc123.js',
      '_next/static/chunks/ghi789.css',
      '_next/static/chunks/turbopack-worker-def456.js',
      '_next/static/media/font.woff2',
    ]);
  });

  // A coverage build ships source maps beside every chunk; they would double what the first visit downloads.
  it('never lists a source map', () => {
    expect(
      toManifest([
        '_next/static/chunks/abc123.js',
        '_next/static/chunks/abc123.js.map',
        '_next/static/chunks/ghi789.css.map',
      ]),
    ).toEqual(['_next/static/chunks/abc123.js']);
  });

  it('sorts, so the same export always gives the same manifest', () => {
    expect(
      toManifest(['_next/static/chunks/b.js', '_next/static/chunks/a.js']),
    ).toEqual(['_next/static/chunks/a.js', '_next/static/chunks/b.js']);
  });
});
