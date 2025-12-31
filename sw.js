
const CACHE_NAME = 'lms-student-cache-v1';

// Assets that should be cached immediately
const PRECACHE_URLS = [
  './',
  './index.html',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and Firebase API calls (let Firebase SDK handle its own socket connection or fail gracefully)
  if (event.request.method !== 'GET' || url.hostname.includes('firebase') || url.hostname.includes('googleapis.com/identitytoolkit')) {
    return;
  }

  // Strategy: Network First, Fallback to Cache for HTML/JS/App Logic
  // Strategy: Cache First, Fallback to Network for Fonts/Images/Immutable Assets
  
  const isStaticAsset = 
    url.hostname === 'esm.sh' || 
    url.hostname === 'cdn.tailwindcss.com' || 
    url.hostname === 'fonts.gstatic.com' ||
    event.request.destination === 'font' ||
    event.request.destination === 'image';

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          // Cache successful responses
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic' || networkResponse.type === 'cors') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
  } else {
    // Network First for everything else (App Shell updates)
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Check if we received a valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // If network fails, return cached response
          return caches.match(event.request);
        })
    );
  }
});
