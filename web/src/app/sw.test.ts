import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('../../public/sw.js', import.meta.url),
  'utf8',
);

// sw.js is a plain script with no import path, so its decision functions are evaluated from raw source.
function extractFunction(name: string): string {
  const start = [`\nfunction ${name}(`, `\nasync function ${name}(`]
    .map((signature) => source.indexOf(signature))
    .find((index) => index >= 0);
  if (start === undefined) throw new Error(`${name} not found in sw.js`);
  const end = source.indexOf('\n}', start + 1) + 2;
  return source.slice(start + 1, end);
}

function load<T>(name: string, preamble = ''): T {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- sw.js exports nothing; evaluating its source is the only way in
  const factory = new Function(
    `${preamble}\n${extractFunction(name)}\nreturn ${name};`,
  ) as () => T;
  return factory();
}

describe('isHashedStaticAsset', () => {
  const isHashedStaticAsset = load<(pathname: string) => boolean>(
    'isHashedStaticAsset',
  );

  it('matches a content-hashed Next.js chunk, the worker bundles included', () => {
    expect(isHashedStaticAsset('/ExposureBuddy/_next/static/chunks/1.js')).toBe(
      true,
    );
    expect(
      isHashedStaticAsset(
        '/ExposureBuddy/_next/static/chunks/exposure.worker.js',
      ),
    ).toBe(true);
  });

  it('does not match the app shell or the manifest', () => {
    expect(isHashedStaticAsset('/ExposureBuddy/')).toBe(false);
    expect(isHashedStaticAsset('/ExposureBuddy/site.webmanifest')).toBe(false);
  });
});

describe('isAppShellRequest', () => {
  const isAppShellRequest =
    load<(pathname: string, mode: string) => boolean>('isAppShellRequest');

  it('matches a navigation regardless of which page it lands on', () => {
    expect(isAppShellRequest('/ExposureBuddy/', 'navigate')).toBe(true);
    expect(isAppShellRequest('/ExposureBuddy/missing/', 'navigate')).toBe(true);
  });

  it('matches the manifest and the header logo even outside a navigation', () => {
    expect(isAppShellRequest('/ExposureBuddy/site.webmanifest', 'cors')).toBe(
      true,
    );
    expect(isAppShellRequest('/ExposureBuddy/logo.svg', 'no-cors')).toBe(true);
  });

  it('matches neither a hashed asset nor an installer icon', () => {
    expect(
      isAppShellRequest('/ExposureBuddy/_next/static/chunks/1.js', 'cors'),
    ).toBe(false);
    expect(isAppShellRequest('/ExposureBuddy/icon-512.png', 'no-cors')).toBe(
      false,
    );
  });
});

describe('the fetch handler', () => {
  it('never intercepts a non-GET request', () => {
    expect(source).toContain("request.method !== 'GET'");
  });

  // Nothing cross-origin is ever cached, so nothing the app did not ship can end up in Cache Storage.
  it('never intercepts a cross-origin request', () => {
    expect(source).toContain('url.origin !== self.location.origin');
  });
});

describe('cacheNameFor', () => {
  const cacheNameFor = load<(search: string) => string>(
    'cacheNameFor',
    "const CACHE_PREFIX = 'exposurebuddy-';",
  );

  it('names the cache after the build that registered the worker', () => {
    expect(cacheNameFor('?build=abc-123')).toBe('exposurebuddy-abc-123');
  });

  // An old build's HTML registers plain sw.js; its worker still needs a cache the next build can delete.
  it('falls back to one prefixed name when no build is given', () => {
    expect(cacheNameFor('')).toBe('exposurebuddy-unversioned');
  });
});

describe('isStaleCache', () => {
  const isStaleCache = load<(key: string, current: string) => boolean>(
    'isStaleCache',
    "const CACHE_PREFIX = 'exposurebuddy-';",
  );

  it("marks an earlier build's cache, and the pre-versioning one, for deletion", () => {
    expect(isStaleCache('exposurebuddy-old', 'exposurebuddy-new')).toBe(true);
    expect(isStaleCache('exposurebuddy-unversioned', 'exposurebuddy-new')).toBe(
      true,
    );
  });

  it("keeps the current build's cache", () => {
    expect(isStaleCache('exposurebuddy-new', 'exposurebuddy-new')).toBe(false);
  });

  // Every project page of a GitHub account shares one origin, and with it Cache Storage.
  it("never touches another site's cache on the same origin", () => {
    expect(isStaleCache('collectionbuddy-v1', 'exposurebuddy-new')).toBe(false);
  });
});

describe('cacheFirst', () => {
  const cacheFirst = load<(request: Request) => Promise<Response>>(
    'cacheFirst',
    "const CACHE_NAME = 'exposurebuddy-test';",
  );
  const request = new Request(
    'https://example.test/ExposureBuddy/_next/static/chunks/1.js',
  );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers from the cache without touching the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(new Response('cached chunk')),
    });

    const response = await cacheFirst(request);

    expect(await response.text()).toBe('cached chunk');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // The stored response's URL is the cache key, without the `#params=` a Turbopack worker chunk boots from;
  // a browser gives a fresh Response the request's URL instead, fragment included.
  it('answers with a copy of the cached response, its status and headers kept', async () => {
    const stored = new Response('cached chunk', {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'text/javascript' },
    });
    vi.stubGlobal('caches', { match: vi.fn().mockResolvedValue(stored) });

    const response = await cacheFirst(request);

    expect(response).not.toBe(stored);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/javascript');
    expect(await response.text()).toBe('cached chunk');
  });

  it('fetches a miss and stores a good response for next time', async () => {
    const cache = { put: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined),
      open: vi.fn().mockResolvedValue(cache),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('fresh chunk', { status: 200 })),
    );

    const response = await cacheFirst(request);

    expect(await response.text()).toBe('fresh chunk');
    expect(cache.put).toHaveBeenCalledWith(request, expect.any(Response));
  });

  it('passes an error status through without caching it', async () => {
    const open = vi.fn();
    vi.stubGlobal('caches', {
      match: vi.fn().mockResolvedValue(undefined),
      open,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('missing', { status: 404 })),
    );

    const response = await cacheFirst(request);

    expect(response.status).toBe(404);
    expect(open).not.toHaveBeenCalled();
  });
});

describe('networkFirst', () => {
  const networkFirst = load<(request: Request) => Promise<Response>>(
    'networkFirst',
    "const CACHE_NAME = 'exposurebuddy-test';",
  );
  const request = new Request('https://example.test/ExposureBuddy/');

  function stubCache(cached?: Response) {
    const cache = {
      match: vi.fn().mockResolvedValue(cached),
      put: vi.fn().mockResolvedValue(undefined),
    };
    const open = vi.fn().mockResolvedValue(cache);
    vi.stubGlobal('caches', { open });
    return { cache, open };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A cached shell from an earlier build would load chunks the deploy removed.
  it("answers with the network's page even when one is cached, and caches it", async () => {
    const { cache, open } = stubCache(new Response('old build'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('new build', { status: 200 })),
    );

    const response = await networkFirst(request);

    expect(await response.text()).toBe('new build');
    expect(open).toHaveBeenCalledWith('exposurebuddy-test');
    expect(cache.put).toHaveBeenCalledWith(request, expect.any(Response));
    expect(cache.match).not.toHaveBeenCalled();
  });

  it('passes an error status through without caching it', async () => {
    const { cache } = stubCache(new Response('old build'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('missing', { status: 404 })),
    );

    const response = await networkFirst(request);

    expect(response.status).toBe(404);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('falls back to the cached page when the network is gone', async () => {
    stubCache(new Response('offline copy'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    const response = await networkFirst(request);

    expect(await response.text()).toBe('offline copy');
  });

  it('fails as the network did when offline with nothing cached', async () => {
    stubCache();
    const failure = new TypeError('offline');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));

    await expect(networkFirst(request)).rejects.toBe(failure);
  });
});

describe('manifestUrl', () => {
  const manifestUrl = load<(scope: string, search: string) => string>(
    'manifestUrl',
    "const PRECACHE_MANIFEST = 'precache.json';",
  );

  it("names the manifest beside the worker, under the site's base path, with the build as cache buster", () => {
    expect(
      manifestUrl('https://x.github.io/ExposureBuddy/', '?build=abc-123'),
    ).toBe('https://x.github.io/ExposureBuddy/precache.json?build=abc-123');
  });

  it('asks for the plain manifest when the registration carried no build', () => {
    expect(manifestUrl('https://x.github.io/ExposureBuddy/', '')).toBe(
      'https://x.github.io/ExposureBuddy/precache.json',
    );
  });
});

describe('precacheUrls', () => {
  const precacheUrls =
    load<(scope: string, manifest: readonly string[]) => string[]>(
      'precacheUrls',
    );
  const scope = 'https://x.github.io/ExposureBuddy/';

  it('starts with the shell, the web manifest and the logo, resolved against the scope', () => {
    expect(precacheUrls(scope, [])).toEqual([
      'https://x.github.io/ExposureBuddy/',
      'https://x.github.io/ExposureBuddy/site.webmanifest',
      'https://x.github.io/ExposureBuddy/logo.svg',
    ]);
  });

  // The manifest lists paths relative to the export root, which is the scope, whatever the base path is.
  it('resolves every manifest entry relative to the scope', () => {
    expect(
      precacheUrls(scope, [
        '_next/static/chunks/abc.js',
        '_next/static/chunks/turbopack-worker-def.js',
      ]),
    ).toEqual([
      'https://x.github.io/ExposureBuddy/',
      'https://x.github.io/ExposureBuddy/site.webmanifest',
      'https://x.github.io/ExposureBuddy/logo.svg',
      'https://x.github.io/ExposureBuddy/_next/static/chunks/abc.js',
      'https://x.github.io/ExposureBuddy/_next/static/chunks/turbopack-worker-def.js',
    ]);
  });

  it('works at the origin root, as on a custom domain', () => {
    expect(
      precacheUrls('https://exposurebuddy.example/', ['_next/static/a.css']),
    ).toEqual([
      'https://exposurebuddy.example/',
      'https://exposurebuddy.example/site.webmanifest',
      'https://exposurebuddy.example/logo.svg',
      'https://exposurebuddy.example/_next/static/a.css',
    ]);
  });
});

describe('fetchManifest', () => {
  const fetchManifest =
    load<(url: string) => Promise<string[]>>('fetchManifest');
  const url = 'https://example.test/ExposureBuddy/precache.json?build=x';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the list the server sent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json(['_next/static/chunks/a.js'])),
    );

    await expect(fetchManifest(url)).resolves.toEqual([
      '_next/static/chunks/a.js',
    ]);
  });

  // `next dev` answers with its 404 page; caching that as a manifest must fail loudly, not quietly.
  it('fails with the status when the manifest is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 404 })),
    );

    await expect(fetchManifest(url)).rejects.toThrow('404');
  });

  it('fails when the body is not a list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ files: [] })),
    );

    await expect(fetchManifest(url)).rejects.toThrow('not a list');
  });
});

describe('precache', () => {
  const scope = 'https://example.test/ExposureBuddy/';
  const precache = load<() => Promise<void>>(
    'precache',
    [
      "const CACHE_NAME = 'exposurebuddy-test';",
      "const PRECACHE_MANIFEST = 'precache.json';",
      extractFunction('manifestUrl'),
      extractFunction('precacheUrls'),
      extractFunction('fetchManifest'),
    ].join('\n'),
  );

  function stubWorkerScope() {
    const cache = { addAll: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('self', {
      registration: { scope },
      location: { search: '?build=abc' },
    });
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) });
    return cache;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches this build's manifest and adds the shell and every entry to this build's cache", async () => {
    const cache = stubWorkerScope();
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(Response.json(['_next/static/chunks/a.js']));
    vi.stubGlobal('fetch', fetchSpy);

    await precache();

    expect(fetchSpy).toHaveBeenCalledWith(`${scope}precache.json?build=abc`);
    expect(cache.addAll).toHaveBeenCalledWith([
      scope,
      `${scope}site.webmanifest`,
      `${scope}logo.svg`,
      `${scope}_next/static/chunks/a.js`,
    ]);
  });

  it('fails as the manifest fetch did, so the install handler can report it', async () => {
    const cache = stubWorkerScope();
    const failure = new TypeError('offline');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));

    await expect(precache()).rejects.toBe(failure);
    expect(cache.addAll).not.toHaveBeenCalled();
  });
});

describe('the install handler', () => {
  it('holds the install until the precache settles, and never fails it', () => {
    expect(source).toContain('event.waitUntil(\n    precache().catch(');
    expect(source).toContain('console.warn(');
  });

  it('activates without waiting for the old worker to lose its tabs', () => {
    expect(source).toContain('self.skipWaiting();');
  });
});

describe('cache versioning', () => {
  it("activating a worker deletes the earlier builds' caches", () => {
    expect(source).toContain(
      'const CACHE_NAME = cacheNameFor(self.location.search);',
    );
    expect(source).toContain('.filter((key) => isStaleCache(key, CACHE_NAME))');
  });

  it('serves the app shell network-first and hashed assets cache-first', () => {
    expect(source).toContain('event.respondWith(networkFirst(request));');
    expect(source).toContain('event.respondWith(cacheFirst(request));');
  });
});
