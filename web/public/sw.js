// The bundle and the shell are precached at install; then cache-first for hashed `_next/static/**`, network-first for the shell, one cache per build.

const CACHE_PREFIX = 'exposurebuddy-';

// Each build registers `sw.js?build=<id>`; an old build's HTML still registers plain `sw.js`.
function cacheNameFor(search) {
  const build = new URLSearchParams(search).get('build') ?? 'unversioned';
  return `${CACHE_PREFIX}${build}`;
}

const CACHE_NAME = cacheNameFor(self.location.search);

// The prefix spares other sites' caches: every project page of an account shares one github.io origin.
function isStaleCache(key, current) {
  return key.startsWith(CACHE_PREFIX) && key !== current;
}

function isHashedStaticAsset(pathname) {
  return pathname.includes('/_next/static/');
}

// The shell is the page, the manifest and the logo the header draws; the icons are only for the installer.
function isAppShellRequest(pathname, mode) {
  return (
    mode === 'navigate' ||
    pathname.endsWith('/site.webmanifest') ||
    pathname.endsWith('/logo.svg')
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  // A copy takes the request's URL; the stored one lost the `#params=` fragment Turbopack's worker chunk boots from.
  if (cached) return new Response(cached.body, cached);
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    void cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) void cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Offline: the last shell this build served, so the app still opens.
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

// Written by scripts/precache-manifest.mjs after `next build`: the hashed bundle, which only a manifest can name.
const PRECACHE_MANIFEST = 'precache.json';

// The build query is a cache buster: a CDN copy of an older manifest would name chunks this build no longer has.
function manifestUrl(scope, search) {
  return new URL(`${PRECACHE_MANIFEST}${search}`, scope).href;
}

// The shell, the manifest and the logo first, then the bundle; every entry resolved against the scope.
function precacheUrls(scope, manifest) {
  return ['./', 'site.webmanifest', 'logo.svg', ...manifest].map(
    (path) => new URL(path, scope).href,
  );
}

async function fetchManifest(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const manifest = await response.json();
  if (!Array.isArray(manifest)) throw new Error(`${url} is not a list`);
  return manifest;
}

async function precache() {
  const { scope } = self.registration;
  const manifest = await fetchManifest(
    manifestUrl(scope, self.location.search),
  );
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(precacheUrls(scope, manifest));
}

self.addEventListener('install', (event) => {
  // Pages already serves only the new build, so waiting for old tabs to close protects nothing.
  self.skipWaiting();
  event.waitUntil(
    precache().catch((error) => {
      // `next dev` serves no manifest; the fetch strategies below fill the cache on demand instead.
      console.warn(
        'Precaching skipped, the app caches itself as it is used:',
        error,
      );
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => isStaleCache(key, CACHE_NAME))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // A GET is the only method either strategy below is safe to apply to.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHashedStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else if (isAppShellRequest(url.pathname, request.mode)) {
    event.respondWith(networkFirst(request));
  }
});
