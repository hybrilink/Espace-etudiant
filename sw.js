// ================================================================
// sw.js
// Service Worker principal — Hybrilink / FSA UNILU
// ================================================================

'use strict';

// ================================================================
// CONFIGURATION
// ================================================================

const APP_SCOPE = '/Espace-etudiant/';
const CACHE_NAME = 'fsa-cache-v5';

const FIREBASE_VERSION = '10.8.0';

const FIREBASE_APP_URL =
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`;

const FIREBASE_MESSAGING_URL =
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging-compat.js`;

// ================================================================
// FIREBASE
// ================================================================

console.log('[FSA-SW] 🔄 Chargement du Service Worker...');

try {
    console.log('[FSA-SW] 📥 Import de Firebase App...');
    importScripts(FIREBASE_APP_URL);
    console.log('[FSA-SW] ✅ Firebase App importé');
    
    console.log('[FSA-SW] 📥 Import de Firebase Messaging...');
    importScripts(FIREBASE_MESSAGING_URL);
    console.log('[FSA-SW] ✅ Firebase Messaging importé');
} catch (error) {
    console.error('[FSA-SW] ❌ Erreur import Firebase:', error);
}

// ================================================================
// CONFIGURATION FIREBASE - CLÉ API CORRECTE
// ================================================================

const firebaseConfig = {
    apiKey: "AIzaSyBb82N2-5ns7qKjQBAj5UvDW87s2PZ27F0",  // ✅ Clé corrigée
    authDomain: "fsa-unilu.firebaseapp.com",
    projectId: "fsa-unilu",
    storageBucket: "fsa-unilu.firebasestorage.app",
    messagingSenderId: "36551990738",
    appId: "1:36551990738:web:e91fdcb53f8aab5d1b7c0b"
};

// ================================================================
// INITIALISATION FIREBASE
// ================================================================

try {
    console.log('[FSA-SW] 🔧 Initialisation de Firebase...');
    firebase.initializeApp(firebaseConfig);
    console.log('[FSA-SW] ✅ Firebase initialisé');
} catch (error) {
    console.error('[FSA-SW] ❌ Erreur initialisation Firebase :', error);
}

let messaging = null;

try {
    console.log('[FSA-SW] 🔧 Initialisation de Firebase Messaging...');
    messaging = firebase.messaging();
    console.log('[FSA-SW] ✅ Firebase Messaging initialisé');
} catch (error) {
    console.error('[FSA-SW] ❌ Firebase Messaging indisponible :', error);
}

// ================================================================
// FICHIERS STATIQUES À METTRE EN CACHE
// ================================================================

const STATIC_FILES = [
    `${APP_SCOPE}`,
    `${APP_SCOPE}index.html`,
    `${APP_SCOPE}etudiant.html`,
    `${APP_SCOPE}login-etudiant.html`,
    `${APP_SCOPE}moyenne.html`,
    `${APP_SCOPE}paiement.html`,
    `${APP_SCOPE}mes-recus.html`,
    `${APP_SCOPE}communiquer.html`,
    `${APP_SCOPE}bulletin.html`,
    `${APP_SCOPE}tp.html`,
    `${APP_SCOPE}style.css`,
    `${APP_SCOPE}notification-utils.js`,
    `${APP_SCOPE}manifest.json`,
    `${APP_SCOPE}icon-192x192.png`,
    `${APP_SCOPE}icon-96x96.png`,
    `${APP_SCOPE}fsa.png`,
    `${APP_SCOPE}t.png`
];

// ================================================================
// OUTILS URL
// ================================================================

function getAppUrl(path = '') {
    try {
        return new URL(
            path,
            self.location.origin + APP_SCOPE
        ).href;
    } catch (error) {
        return self.location.origin + APP_SCOPE;
    }
}

function getAssetUrl(filename) {
    return getAppUrl(filename);
}

// ================================================================
// INSTALLATION
// ================================================================

self.addEventListener('install', event => {

    console.log('[FSA-SW] 📦 Installation du Service Worker...');

    event.waitUntil(
        (async () => {

            try {

                const cache = await caches.open(CACHE_NAME);

                await Promise.all(
                    STATIC_FILES.map(async url => {

                        try {

                            await cache.add(url);

                            console.log(
                                '[FSA-SW] ✅ Fichier mis en cache :',
                                url
                            );

                        } catch (error) {

                            console.warn(
                                '[FSA-SW] ⚠️ Impossible de mettre en cache :',
                                url,
                                error
                            );
                        }

                    })
                );

                console.log('[FSA-SW] ✅ Installation terminée');

            } catch (error) {

                console.error('[FSA-SW] ❌ Erreur installation :', error);

            }

            await self.skipWaiting();

        })()
    );
});

// ================================================================
// ACTIVATION
// ================================================================

self.addEventListener('activate', event => {

    console.log('[FSA-SW] 🔄 Activation du Service Worker...');

    event.waitUntil(
        (async () => {

            try {

                const cacheNames = await caches.keys();

                await Promise.all(
                    cacheNames.map(cacheName => {

                        if (
                            cacheName.startsWith('fsa-cache-') &&
                            cacheName !== CACHE_NAME
                        ) {

                            console.log(
                                '[FSA-SW] 🗑️ Suppression ancien cache :',
                                cacheName
                            );

                            return caches.delete(cacheName);
                        }

                        return Promise.resolve(false);
                    })
                );

                await self.clients.claim();

                console.log('[FSA-SW] ✅ Service Worker actif');

            } catch (error) {

                console.error('[FSA-SW] ❌ Erreur activation :', error);

            }

        })()
    );
});

// ================================================================
// FETCH
// ================================================================

self.addEventListener('fetch', event => {

    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    let requestUrl;

    try {
        requestUrl = new URL(request.url);
    } catch (error) {
        return;
    }

    const isSameOrigin =
        requestUrl.origin === self.location.origin;

    if (!isSameOrigin) {
        return;
    }

    if (!requestUrl.pathname.startsWith(APP_SCOPE)) {
        return;
    }

    if (
        request.mode === 'navigate' ||
        request.destination === 'document'
    ) {

        event.respondWith(
            (async () => {

                try {

                    const networkResponse =
                        await fetch(request);

                    if (
                        networkResponse &&
                        networkResponse.ok
                    ) {

                        const cache =
                            await caches.open(CACHE_NAME);

                        await cache.put(
                            request,
                            networkResponse.clone()
                        );
                    }

                    return networkResponse;

                } catch (error) {

                    console.warn(
                        '[FSA-SW] 📴 Hors ligne :',
                        request.url
                    );

                    const cachedResponse =
                        await caches.match(request);

                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    const fallback =
                        await caches.match(
                            getAppUrl('etudiant.html')
                        );

                    if (fallback) {
                        return fallback;
                    }

                    return new Response(
                        `
                        <!DOCTYPE html>
                        <html lang="fr">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport"
                                  content="width=device-width,initial-scale=1">
                            <title>Hors connexion</title>
                        </head>
                        <body>
                            <h2>Vous êtes hors connexion</h2>
                            <p>
                                Cette page n'est pas encore disponible
                                hors connexion.
                            </p>
                        </body>
                        </html>
                        `,
                        {
                            status: 503,
                            headers: {
                                'Content-Type': 'text/html; charset=UTF-8'
                            }
                        }
                    );
                }

            })()
        );

        return;
    }

    event.respondWith(
        (async () => {

            const cachedResponse =
                await caches.match(request);

            if (cachedResponse) {
                return cachedResponse;
            }

            try {

                const networkResponse =
                    await fetch(request);

                if (
                    networkResponse &&
                    networkResponse.ok
                ) {

                    const cache =
                        await caches.open(CACHE_NAME);

                    await cache.put(
                        request,
                        networkResponse.clone()
                    );
                }

                return networkResponse;

            } catch (error) {

                console.warn(
                    '[FSA-SW] 📴 Ressource indisponible :',
                    request.url
                );

                return new Response(
                    '',
                    {
                        status: 503,
                        statusText: 'Service Unavailable'
                    }
                );
            }

        })()
    );
});

// ================================================================
// FIREBASE CLOUD MESSAGING
// ================================================================

if (messaging) {

    console.log('[FSA-SW] 📡 Configuration du listener FCM...');

    messaging.onBackgroundMessage(payload => {

        console.log('[FSA-SW] 📨 Notification reçue en arrière-plan :', payload);

        const notification =
            payload.notification || {};

        const data =
            payload.data || {};

        const title =
            data.title ||
            notification.title ||
            'Faculté Agronomique';

        const body =
            data.body ||
            notification.body ||
            'Nouvelle information disponible';

        const requestedUrl =
            data.url ||
            notification.click_action ||
            'etudiant.html';

        const clickUrl =
            getAppUrl(requestedUrl);

        const type =
            data.type ||
            'info';

        const communiqueId =
            data.communiqueId ||
            null;

        const tag =
            data.tag ||
            `fsa-${type}-${Date.now()}`;

        const options = {

            body: body,

            icon:
                notification.icon ||
                getAssetUrl('icon-192x192.png'),

            badge:
                notification.badge ||
                getAssetUrl('icon-96x96.png'),

            data: {

                url: clickUrl,

                type: type,

                communiqueId:
                    communiqueId

            },

            tag: tag,

            renotify: true,

            requireInteraction: false,

            vibrate: [
                200,
                100,
                200
            ]

        };

        return self.registration.showNotification(
            title,
            options
        );

    });

    console.log('[FSA-SW] ✅ Listener FCM configuré');

} else {

    console.warn('[FSA-SW] ⚠️ Firebase Messaging non disponible');
}

// ================================================================
// GESTIONNAIRE PUSH
// ================================================================

self.addEventListener('push', event => {

    console.log('[FSA-SW] 📨 Push event reçu :', event);

    let data = {};

    try {
        if (event.data) {
            try {
                data = event.data.json();
            } catch (e) {
                const text = event.data.text();
                try {
                    data = JSON.parse(text);
                } catch (e2) {
                    data = { body: text };
                }
            }
        }
    } catch (error) {
        console.warn('[FSA-SW] ⚠️ Erreur parsing push data :', error);
    }

    const title = data.title || 'Faculté Agronomique';
    const body = data.body || 'Nouvelle information disponible';

    const options = {
        body: body,
        icon: getAssetUrl('icon-192x192.png'),
        badge: getAssetUrl('icon-96x96.png'),
        data: {
            url: data.url || getAppUrl('etudiant.html'),
            type: data.type || 'info',
        },
        tag: `fsa-push-${Date.now()}`,
        renotify: true,
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// ================================================================
// CLIC SUR NOTIFICATION
// ================================================================

self.addEventListener(
    'notificationclick',
    event => {

        console.log(
            '[FSA-SW] 👆 Notification cliquée'
        );

        const notification =
            event.notification;

        const data =
            notification.data || {};

        const action =
            event.action;

        notification.close();

        if (action === 'close') {
            return;
        }

        event.waitUntil(
            (async () => {

                let targetUrl =
                    data.url ||
                    getAppUrl('etudiant.html');

                try {

                    const parsedUrl =
                        new URL(
                            targetUrl,
                            self.location.origin + APP_SCOPE
                        );

                    if (
                        parsedUrl.origin !==
                        self.location.origin
                    ) {

                        targetUrl =
                            getAppUrl('etudiant.html');

                    } else if (
                        !parsedUrl.pathname.startsWith(
                            APP_SCOPE
                        )
                    ) {

                        targetUrl =
                            getAppUrl('etudiant.html');
                    } else {

                        targetUrl =
                            parsedUrl.href;
                    }

                } catch (error) {

                    targetUrl =
                        getAppUrl('etudiant.html');
                }

                if (
                    data.communiqueId &&
                    !targetUrl.includes('communique=')
                ) {

                    try {

                        const url =
                            new URL(targetUrl);

                        url.searchParams.set(
                            'communique',
                            data.communiqueId
                        );

                        targetUrl =
                            url.href;

                    } catch (error) {

                        console.warn(
                            '[FSA-SW] ⚠️ Impossible de construire URL communiqué'
                        );
                    }
                }

                const clientList =
                    await self.clients.matchAll({
                        type: 'window',
                        includeUncontrolled: true
                    });

                const appClient =
                    clientList.find(client => {

                        try {

                            const clientUrl =
                                new URL(client.url);

                            return (
                                clientUrl.origin ===
                                    self.location.origin &&
                                clientUrl.pathname.startsWith(
                                    APP_SCOPE
                                )
                            );

                        } catch (error) {

                            return false;
                        }

                    });

                if (appClient) {

                    try {

                        await appClient.focus();

                    } catch (error) {
                        console.warn(
                            '[FSA-SW] ⚠️ Focus impossible :',
                            error
                        );
                    }

                    try {

                        if (
                            'navigate' in appClient &&
                            typeof appClient.navigate ===
                                'function'
                        ) {

                            await appClient.navigate(
                                targetUrl
                            );
                        }

                    } catch (error) {

                        console.warn(
                            '[FSA-SW] ⚠️ Navigation impossible :',
                            error
                        );
                    }

                    return;
                }

                await self.clients.openWindow(
                    targetUrl
                );

            })()
        );

    }
);

// ================================================================
// MESSAGE
// ================================================================

self.addEventListener(
    'message',
    event => {

        const message =
            event.data || {};

        console.log('[FSA-SW] 📨 Message reçu:', message.type);

        if (
            message.type ===
            'SKIP_WAITING'
        ) {

            self.skipWaiting();

            return;
        }

        if (
            message.type ===
            'GET_SW_VERSION'
        ) {

            if (
                event.ports &&
                event.ports[0]
            ) {

                event.ports[0].postMessage({
                    version: CACHE_NAME,
                    scope: APP_SCOPE
                });
            }

            return;
        }

    }
);

// ================================================================
// FIN
// ================================================================

console.log('[FSA-SW] ✅ Service Worker Hybrilink chargé');
console.log('[FSA-SW] 📁 Scope :', APP_SCOPE);
console.log('[FSA-SW] 💾 Cache :', CACHE_NAME);
