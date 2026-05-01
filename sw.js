// sw.js - Service Worker principal avec cache et FCM

const CACHE_NAME = 'fac-agro-v5';
const STATIC_CACHE = 'fac-agro-static-v5';

const urlsToCache = [
    '/',
    'index.html',
    'login-etudiant.html',
    'login-comptabilite.html',
    'login-academique.html',
    'etudiant.html',
    'paiement.html',
    'profil.html',
    'apropos.html',
    'bulletin.html',
    'moyenne.html',
    'interro-ligne.html',
    'mes-recus.html',
    'horaires.html',
    'mes-cours.html',
    'communiquer.html',
    'tp.html',
    'conduite.html',
    'offline.html',
    'manifest.json',
    'firebase-messaging-sw.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js'
];

// Installation
self.addEventListener('install', event => {
    console.log('[SW] Installation v5');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activation
self.addEventListener('activate', event => {
    console.log('[SW] Activation v5');
    event.waitUntil(
        Promise.all([
            caches.keys().then(keys => {
                return Promise.all(
                    keys.filter(key => key !== CACHE_NAME && key !== STATIC_CACHE)
                        .map(key => caches.delete(key))
                );
            }),
            self.clients.claim()
        ])
    );
});

// Stratégie de cache
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then(response => {
                    if (response) return response;
                    if (event.request.mode === 'navigate') {
                        return caches.match('offline.html');
                    }
                    return new Response('Hors ligne', { status: 503 });
                });
            })
    );
});

// Messages du client
self.addEventListener('message', event => {
    if (event.data?.type === 'SAVE_STUDENT_SESSION') {
        console.log('[SW] Session sauvegardée:', event.data.studentId);
        // Stocker l'ID pour usage futur
        caches.open('session-cache').then(cache => {
            cache.put('last-student-id', new Response(event.data.studentId));
        });
    }
});

console.log('[SW] ✅ Service Worker principal actif');
