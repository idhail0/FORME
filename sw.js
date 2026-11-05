// FORME service worker.
// - App code (HTML/JS/CSS/manifest): network first, so every Vercel deploy
//   reaches users on their next visit; the cache is the offline fallback.
// - Pinned CDN modules and fonts: cache first (their URLs are versioned).
// - Icons and images: stale-while-revalidate.
// - Supabase (auth, data, signed image URLs) is never cached.
const VERSION = 'v6';
const SHELL_CACHE = 'forme-shell-' + VERSION;
const RUNTIME_CACHE = 'forme-runtime-' + VERSION;
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/pwa.css',
  '/app.js',
  '/store.js',
  '/data.js',
  '/supabase/client.js',
  '/supabase/config.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.svg',
  '/features/html.js',
  '/features/colors.js',
  '/features/vision.js',
  '/features/vision-worker.js',
  '/features/garment-embeddings.json',
  '/features/upload-flow.js',
  '/features/mannequin.js',
  '/features/garment-fit.js',
  '/features/look-score.js'
];
// cdn.jsdelivr.net serves the pinned Transformers.js / ONNX Runtime builds for smart uploads.
const CDN_HOSTS = new Set(['esm.sh', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net']);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // cache: 'reload' skips the HTTP cache so a new worker never stores stale files.
    await cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('forme-') && !keep.has(key)).map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(cacheKey || request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(cacheKey || request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('offline and not cached');
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Every in-app route (/, /stylist, ...) is the same single page.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        const response = preload || await fetch(request);
        if (response.ok && url.origin === self.location.origin) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/uploads/')) {
      event.respondWith(staleWhileRevalidate(request));
    } else {
      event.respondWith(networkFirst(request, url.pathname));
    }
    return;
  }

  if (CDN_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.hostname === 'images.unsplash.com') {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Everything else (Supabase, AI providers) goes straight to the network.
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
