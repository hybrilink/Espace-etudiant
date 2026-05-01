// sw.js - Service Worker principal
// Version complète avec cache et gestion des notifications

const CACHE_NAME = 'fac-agro-v8';
const STATIC_CACHE = 'fac-agro-static-v8';

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
    console.log('[SW] Installation v8');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Fetch - stratégie de cache
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request)
                    .then(response => {
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        return response;
                    })
                    .catch(() => {
                        if (event.request.mode === 'navigate') {
                            return caches.match('offline.html');
                        }
                        return new Response('Hors ligne', { status: 503 });
                    });
            })
    );
});

// Activation
self.addEventListener('activate', event => {
    console.log('[SW] Activation v8');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
                        console.log('[SW] Suppression ancien cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 🔔 GESTION DES MESSAGES PUSH (depuis Firebase)
self.addEventListener('push', function(event) {
    console.log('[SW] 📨 Push reçu:', event);
    
    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch(e) {
            data = { title: 'Nouvelle notification', body: event.data.text() };
        }
    }
    
    const options = {
        body: data.body || 'Nouvelle information disponible',
        icon: '/icon-192x192.png',
        badge: '/icon-96x96.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/',
            id: data.id,
            type: data.type || 'communique'
        },
        requireInteraction: true,
        actions: [
            { action: 'open', title: '📖 Voir', icon: '/icon-96x96.png' },
            { action: 'close', title: '✕ Fermer', icon: '/icon-96x96.png' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'Faculté Agronomique', options)
    );
});

// 🔔 GESTION DU CLIC SUR NOTIFICATION
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] 🔔 Clic notification:', event.notification.data);
    
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || '/';
    const notificationId = event.notification.data?.id;
    const notificationType = event.notification.data?.type;
    
    let finalUrl = urlToOpen;
    if (notificationId && notificationType === 'communique') {
        finalUrl = `communiquer.html?communique=${notificationId}`;
    } else if (notificationId && notificationType === 'paiement') {
        finalUrl = `paiement.html?id=${notificationId}`;
    }
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(function(clientList) {
                    for (let i = 0; i < clientList.length; i++) {
                        const client = clientList[i];
                        if (client.url.includes('/') && 'focus' in client) {
                            client.postMessage({
                                type: 'NOTIFICATION_CLICKED',
                                url: finalUrl,
                                id: notificationId
                            });
                            return client.focus();
                        }
                    }
                    if (clients.openWindow) {
                        return clients.openWindow(finalUrl);
                    }
                })
        );
    }
});

// Messages du client
self.addEventListener('message', event => {
    console.log('[SW] Message reçu:', event.data?.type);
    
    if (event.data?.type === 'SAVE_STUDENT_SESSION') {
        console.log('[SW] Session étudiant sauvegardée:', event.data.studentId);
        // Stocker dans cache pour usage ultérieur
        caches.open('session-cache').then(cache => {
            cache.put('last-student-id', new Response(event.data.studentId));
        });
    }
});

console.log('[SW] ✅ Service Worker principal v8 actif');
