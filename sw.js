const CACHE_NAME = 'folia-v4';

const APP_SHELL = [
  '/',
  '/index.html',
  '/sitter-brief/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Jost:wght@300;400;500;600&display=swap'
];

// Install — cache app shell
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    })
  );
});

// Activate — delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fall back to cache for app shell
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go network-first for API calls and Supabase
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('anthropic') ||
    url.hostname.includes('klaviyo') ||
    url.pathname.includes('/.netlify/functions/')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // For everything else: network first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          // If no cache for this page, return the app shell
          return caches.match('/');
        });
      })
  );
});
