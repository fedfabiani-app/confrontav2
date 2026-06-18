const CACHE_NAME = 'oroscopo-italiano-v4';
const CACHE_URLS = [
  '/',
  '/manifest.json',
];

// Cache API routes that are safe to cache (read-only GET requests)
const CACHEABLE_API_ROUTES = [
  '/api/zodiac-signs',
  '/api/sources',
];

// Never cache these routes (refresh endpoints)
const NEVER_CACHE_ROUTES = [
  '/api/refresh/',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache refresh endpoints
  if (NEVER_CACHE_ROUTES.some(route => url.pathname.includes(route))) {
    return; // Let the request go to network
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    // Cache-first strategy for safe read-only endpoints
    if (CACHEABLE_API_ROUTES.some(route => url.pathname.startsWith(route))) {
      event.respondWith(
        caches.match(request).then((response) => {
          if (response) {
            return response;
          }
          return fetch(request).then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          });
        })
      );
    } else {
      // Network-first for other API requests
      event.respondWith(
        fetch(request).catch(() =>
          caches.match(request).then(
            (cached) => cached || new Response('', { status: 503, statusText: 'Service Unavailable' })
          )
        )
      );
    }
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(request).then((response) => {
        if (response.ok && request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('/');
        }
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      ),
      self.clients.claim(),
    ])
  );
});
