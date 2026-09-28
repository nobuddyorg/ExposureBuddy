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
      isHashedStaticAsset('/ExposureBuddy/_next/static/chunks/align.worker.js'),
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
