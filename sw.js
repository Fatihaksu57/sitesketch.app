// SiteSketch Service Worker — Offline Support
const CACHE_NAME = 'sitesketch-v1.15';
const ASSETS = [
    '/',
    '/index.html',
    '/css/app.css',
    '/js/tools.js',
    '/js/cloud.js',
    '/js/database.js',
    '/js/editor.js',
    '/js/app.js',
    '/manifest.json',
    '/assets/logo.png',
    '/assets/qfm-logo.png',
    '/assets/favicon.png',
    '/assets/apple-touch-icon.png',
    '/pdf/SiteSketch_Arbeitsanweisung.pdf',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Install: Cache alle App-Dateien
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('SW: Caching App-Dateien...');
            return cache.addAll(ASSETS).catch(err => {
                console.warn('SW: Einige Dateien konnten nicht gecached werden:', err);
                // Cache was possible, skip failures
                return Promise.allSettled(ASSETS.map(url => cache.add(url).catch(() => {})));
            });
        })
    );
    self.skipWaiting();
});

// Activate: Alte Caches löschen
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => {
                    console.log('SW: Alter Cache gelöscht:', key);
                    return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch: Cache-First für App-Dateien, Network-First für API und Karten
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // API-Requests: immer Netzwerk, kein Cache
    if (url.hostname === 'api.sitesketch.app') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({ error: 'Offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Kartenkacheln: Network-First mit Cache
    if (url.hostname.includes('tile.openstreetmap.org') ||
        url.hostname.includes('tiles.') ||
        url.hostname.includes('basemaps.')) {
        event.respondWith(
            fetch(event.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME + '-tiles').then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => {
                return caches.match(event.request);
            })
        );
        return;
    }

    // Google Maps API: Network-First
    if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
        event.respondWith(
            fetch(event.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => {
                return caches.match(event.request);
            })
        );
        return;
    }

    // App-Dateien: Cache-First (schnell!)
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                // Cache neue Dateien für nächstes Mal
                if (response.ok && event.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => {
                // Offline Fallback für HTML-Seiten
                if (event.request.destination === 'document') {
                    return caches.match('/index.html');
                }
            });
        })
    );
});
