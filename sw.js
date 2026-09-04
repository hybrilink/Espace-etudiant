// ================================================================
// sw.js
// Service Worker principal — Hybrilink / FSA UNILU
// ================================================================

'use strict';

// ================================================================
// CONFIGURATION
// ================================================================

const APP_SCOPE = '/Espace-etudiant/';
const CACHE_NAME = 'fsa-cache-v3';

const FIREBASE_VERSION = '10.8.0';

const FIREBASE_APP_URL =
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`;

const FIREBASE_MESSAGING_URL =
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging-compat.js`;

// ================================================================
// FIREBASE
// ================================================================

importScripts(FIREBASE_APP_URL);
importScripts(FIREBASE_MESSAGING_URL);

// ================================================================
// CONFIGURATION FIREBASE
// ================================================================

const firebaseConfig = {
    apiKey: "AIzaSyBb82N2-5ns7qKjQBAj5UvDW87s2PZ27F0",
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
    firebase.initializeApp(firebaseConfig);
} catch (error) {
    console.error(
        '[FSA-SW] Erreur initialisation Firebase :',
        error
    );
}

let messaging = null;

try {
    messaging = firebase.messaging();

    console.log(
        '[FSA-SW] Firebase Messaging initialisé'
    );
} catch (error) {
    console.error(
        '[FSA-SW] Firebase Messaging indisponible :',
        error
    );
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

    console.log(
        '[FSA-SW] Installation du Service Worker...'
    );

    event.waitUntil(
        (async () => {

            try {

                const cache = await caches.open(CACHE_NAME);

                /*
                 * On ajoute les fichiers un par un.
                 * Ainsi, si un fichier n'existe pas encore,
                 * toute l'installation ne sera pas annulée.
                 */

                await Promise.all(
                    STATIC_FILES.map(async url => {

                        try {

                            await cache.add(url);

                            console.log(
                                '[FSA-SW] Fichier mis en cache :',
                                url
                            );

                        } catch (error) {

                            console.warn(
                                '[FSA-SW] Impossible de mettre en cache :',
                                url
                            );
                        }

                    })
                );

                console.log(
                    '[FSA-SW] Installation terminée'
                );

            } catch (error) {

                console.error(
                    '[FSA-SW] Erreur installation :',
                    error
                );

            }

            /*
             * Active immédiatement le nouveau SW.
             */

            await self.skipWaiting();

        })()
    );
});

// ================================================================
// ACTIVATION
// ================================================================

self.addEventListener('activate', event => {

    console.log(
        '[FSA-SW] Activation du Service Worker...'
    );

    event.waitUntil(
        (async () => {

            try {

                const cacheNames = await caches.keys();

                await Promise.all(
                    cacheNames.map(cacheName => {

                        /*
                         * On supprime uniquement les anciennes
                         * versions du cache de cette application.
                         *
                         * On ne touche PAS aux autres caches
                         * présents sur le domaine.
                         */

                        if (
                            cacheName.startsWith('fsa-cache-') &&
                            cacheName !== CACHE_NAME
                        ) {

                            console.log(
                                '[FSA-SW] Suppression ancien cache :',
                                cacheName
                            );

                            return caches.delete(cacheName);
                        }

                        return Promise.resolve(false);
                    })
                );

                /*
                 * Prend immédiatement le contrôle
                 * des pages ouvertes.
                 */

                await self.clients.claim();

                console.log(
                    '[FSA-SW] Service Worker actif'
                );

            } catch (error) {

                console.error(
                    '[FSA-SW] Erreur activation :',
                    error
                );

            }

        })()
    );
});

// ================================================================
// FETCH — GESTION DU CACHE
// ================================================================

self.addEventListener('fetch', event => {

    const request = event.request;

    /*
     * Nous ne traitons que GET.
     */

    if (request.method !== 'GET') {
        return;
    }

    let requestUrl;

    try {
        requestUrl = new URL(request.url);
    } catch (error) {
        return;
    }

    /*
     * On ne veut surtout pas mettre Firebase,
     * Google APIs ou Cloud Functions dans notre cache.
     */

    const isSameOrigin =
        requestUrl.origin === self.location.origin;

    if (!isSameOrigin) {
        return;
    }

    /*
     * Ne pas intercepter les ressources qui ne concernent
     * pas l'application.
     */

    if (!requestUrl.pathname.startsWith(APP_SCOPE)) {
        return;
    }

    /*
     * Pour les pages HTML :
     *
     * NETWORK FIRST
     *
     * On essaie d'abord Internet afin d'avoir la
     * version la plus récente.
     *
     * Si Internet est indisponible :
     * → utiliser le cache.
     */

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
                        '[FSA-SW] Hors ligne :',
                        request.url
                    );

                    const cachedResponse =
                        await caches.match(request);

                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    /*
                     * Dernier recours :
                     * page étudiant.
                     */

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

    /*
     * Pour CSS, JS, images, etc. :
     *
     * CACHE FIRST
     *
     * Si disponible dans le cache → utilisation immédiate.
     * Sinon → réseau puis ajout au cache.
     */

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
                    '[FSA-SW] Ressource indisponible :',
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

    messaging.onBackgroundMessage(payload => {

        console.log(
            '[FSA-SW] Notification reçue en arrière-plan :',
            payload
        );

        const notification =
            payload.notification || {};

        const data =
            payload.data || {};

        /*
         * Les données peuvent provenir :
         *
         * 1. de notification
         * 2. de data
         *
         * data est prioritaire pour notre architecture.
         */

        const title =
            data.title ||
            notification.title ||
            'Faculté Agronomique';

        const body =
            data.body ||
            notification.body ||
            'Nouvelle information disponible';

        /*
         * URL de destination.
         */

        const requestedUrl =
            data.url ||
            notification.click_action ||
            'etudiant.html';

        const clickUrl =
            getAppUrl(requestedUrl);

        /*
         * Identifiants utiles.
         */

        const type =
            data.type ||
            'info';

        const communiqueId =
            data.communiqueId ||
            null;

        const cotationId =
            data.cotationId ||
            null;

        const carteId =
            data.carteId ||
            null;

        const transactionId =
            data.transactionId ||
            null;

        const projectId =
            data.projectId ||
            null;

        /*
         * Tag unique par type.
         *
         * Cela évite que toutes les notifications
         * soient considérées comme identiques.
         */

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
                    communiqueId,

                cotationId:
                    cotationId,

                carteId:
                    carteId,

                transactionId:
                    transactionId,

                projectId:
                    projectId

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

        /*
         * IMPORTANT :
         *
         * Le backend doit envoyer des messages DATA ONLY
         * pour cette architecture.
         *
         * Ainsi, c'est CE Service Worker qui affiche
         * une seule notification.
         */

        return self.registration.showNotification(
            title,
            options
        );

    });

}

// ================================================================
// CLIC SUR UNE NOTIFICATION
// ================================================================

self.addEventListener(
    'notificationclick',
    event => {

        console.log(
            '[FSA-SW] Notification cliquée'
        );

        const notification =
            event.notification;

        const data =
            notification.data || {};

        const action =
            event.action;

        /*
         * Fermer immédiatement la notification.
         */

        notification.close();

        /*
         * Bouton Fermer.
         */

        if (action === 'close') {
            return;
        }

        event.waitUntil(
            (async () => {

                /*
                 * URL initiale.
                 */

                let targetUrl =
                    data.url ||
                    getAppUrl('etudiant.html');

                /*
                 * Sécurité :
                 * si l'URL n'est pas celle de notre application,
                 * on revient vers l'application.
                 */

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

                /*
                 * Si c'est un communiqué, on ajoute son ID
                 * uniquement s'il n'est pas déjà présent.
                 */

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
                            '[FSA-SW] Impossible de construire URL communiqué'
                        );
                    }
                }

                /*
                 * Chercher une fenêtre déjà ouverte
                 * de notre application.
                 */

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

                /*
                 * Si l'application est déjà ouverte :
                 *
                 * → focus
                 * → navigation
                 */

                if (appClient) {

                    try {

                        await appClient.focus();

                    } catch (error) {
                        console.warn(
                            '[FSA-SW] Focus impossible :',
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
                            '[FSA-SW] Navigation impossible :',
                            error
                        );
                    }

                    return;
                }

                /*
                 * Sinon :
                 * ouvrir une nouvelle fenêtre.
                 */

                await self.clients.openWindow(
                    targetUrl
                );

            })()
        );

    }
);

// ================================================================
// MESSAGE DEPUIS LES PAGES
// ================================================================

self.addEventListener(
    'message',
    event => {

        const message =
            event.data || {};

        /*
         * Permet au frontend de forcer
         * l'activation du nouveau Service Worker.
         */

        if (
            message.type ===
            'SKIP_WAITING'
        ) {

            self.skipWaiting();

            return;
        }

        /*
         * Demande de version.
         */

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
// FIN DU SERVICE WORKER
// ================================================================

console.log(
    '[FSA-SW] Service Worker Hybrilink chargé'
);

console.log(
    '[FSA-SW] Scope :',
    APP_SCOPE
);

console.log(
    '[FSA-SW] Cache :',
    CACHE_NAME
);