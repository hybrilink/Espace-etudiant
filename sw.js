// sw.js - Service Worker optimisé pour FAC Agro
// Version avec notifications en arrière-plan et Periodic Sync

const CACHE_NAME = 'fac-agro-v4';
const NOTIFICATION_CACHE = 'fac-agro-notifications-v2';
const SYNC_TAG = 'check-notifications';
const PERIODIC_SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes

// URLs à mettre en cache
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
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js'
];

// ==================== INSTALLATION ====================
self.addEventListener('install', event => {
    console.log('[SW] Installation v4 - Optimisé');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Mise en cache des ressources');
                return cache.addAll(urlsToCache).catch(error => {
                    console.error('[SW] Erreur cache:', error);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// ==================== ACTIVATION ====================
self.addEventListener('activate', event => {
    console.log('[SW] Activation v4');
    
    event.waitUntil(
        Promise.all([
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== NOTIFICATION_CACHE) {
                            console.log('[SW] Suppression ancien cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            self.clients.claim(),
            registerPeriodicSync()
        ])
    );
});

// ==================== SYNCHRONISATION PÉRIODIQUE ====================
async function registerPeriodicSync() {
    if ('periodicSync' in self.registration) {
        try {
            const status = await navigator.permissions.query({
                name: 'periodic-background-sync',
            });
            
            if (status.state === 'granted') {
                await self.registration.periodicSync.register(SYNC_TAG, {
                    minInterval: PERIODIC_SYNC_INTERVAL
                });
                console.log('[SW] ✅ Synchronisation périodique enregistrée');
            } else {
                console.log('[SW] ⚠️ Permission periodic sync non accordée');
            }
        } catch (error) {
            console.warn('[SW] Periodic sync non disponible:', error);
        }
    }
}

self.addEventListener('periodicsync', event => {
    console.log('[SW] 🔄 Synchronisation périodique déclenchée');
    if (event.tag === SYNC_TAG) {
        event.waitUntil(checkNewNotifications());
    }
});

// ==================== VÉRIFICATION DES NOTIFICATIONS ====================
async function getLastNotificationCheck() {
    try {
        const cache = await caches.open(NOTIFICATION_CACHE);
        const response = await cache.match('last-check-time');
        if (response) {
            const timestamp = await response.text();
            return parseInt(timestamp) || 0;
        }
    } catch (error) {
        console.error('[SW] Erreur lecture timestamp:', error);
    }
    return 0;
}

async function setLastNotificationCheck() {
    try {
        const cache = await caches.open(NOTIFICATION_CACHE);
        await cache.put('last-check-time', new Response(Date.now().toString()));
    } catch (error) {
        console.error('[SW] Erreur sauvegarde timestamp:', error);
    }
}

async function checkNewNotifications() {
    console.log('[SW] 📡 Vérification des nouvelles notifications...');
    
    try {
        const studentId = await getLastStudentId();
        if (!studentId) {
            console.log('[SW] Aucun étudiant connecté');
            return;
        }
        
        const lastCheck = await getLastNotificationCheck();
        const now = Date.now();
        
        // Calculer la date de dernière vérification (24h max)
        const sinceDate = new Date(lastCheck > 0 ? lastCheck : now - 86400000);
        
        // Appel REST à Firestore
        const response = await fetch(
            `https://firestore.googleapis.com/v1/projects/fsa-unilu/databases/(default)/documents/communiques?orderBy=dateCreation desc&pageSize=20`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-cache'
            }
        );
        
        if (!response.ok) throw new Error('HTTP ' + response.status);
        
        const data = await response.json();
        const notifications = [];
        
        if (data.documents) {
            for (const doc of data.documents) {
                const fields = doc.fields;
                const docId = doc.name.split('/').pop();
                
                // Vérifier si déjà envoyée
                const alreadySent = await isNotificationSent(docId);
                if (alreadySent) continue;
                
                // Vérifier la date
                let dateCreation = 0;
                if (fields.dateCreation?.timestampValue) {
                    dateCreation = new Date(fields.dateCreation.timestampValue).getTime();
                }
                
                if (dateCreation > lastCheck) {
                    // Vérifier si l'étudiant est concerné par la promotion
                    const promotions = fields.promotions?.arrayValue?.values || [];
                    const studentPromotion = await getStudentPromotion(studentId);
                    
                    let estConcerne = true;
                    if (promotions.length > 0) {
                        estConcerne = promotions.some(p => 
                            p.stringValue === studentPromotion
                        );
                    }
                    
                    if (estConcerne) {
                        notifications.push({
                            id: docId,
                            titre: fields.titre?.stringValue || 'Nouveau communiqué',
                            message: fields.description?.stringValue || '',
                            url: '/communiquer.html',
                            dateCreation: dateCreation
                        });
                    }
                }
            }
        }
        
        // Afficher les nouvelles notifications
        for (const notif of notifications) {
            await showSystemNotification(notif);
            await markNotificationSent(notif.id);
        }
        
        await setLastNotificationCheck();
        
        if (notifications.length > 0) {
            console.log(`[SW] 📨 ${notifications.length} nouvelle(s) notification(s) affichée(s)`);
            
            // Notifier les clients ouverts
            const clients = await self.clients.matchAll();
            for (const client of clients) {
                client.postMessage({
                    type: 'NEW_NOTIFICATIONS',
                    count: notifications.length,
                    notifications: notifications
                });
            }
        }
        
    } catch (error) {
        console.error('[SW] Erreur vérification:', error);
    }
}

async function showSystemNotification(notif) {
    const options = {
        body: notif.message?.substring(0, 200) || 'Cliquez pour voir le détail',
        icon: 'icon-192x192.png',
        badge: 'icon-96x96.png',
        tag: notif.id,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        renotify: true,
        data: {
            url: notif.url || '/communiquer.html',
            notificationId: notif.id,
            type: 'communique',
            timestamp: Date.now()
        },
        actions: [
            { action: 'open', title: '📖 Voir', icon: 'icon-96x96.png' },
            { action: 'close', title: '✕ Fermer', icon: 'icon-96x96.png' }
        ]
    };
    
    await self.registration.showNotification(notif.titre, options);
}

async function isNotificationSent(notificationId) {
    try {
        const cache = await caches.open(NOTIFICATION_CACHE);
        const response = await cache.match(`sent:${notificationId}`);
        return !!response;
    } catch (error) {
        return false;
    }
}

async function markNotificationSent(notificationId) {
    try {
        const cache = await caches.open(NOTIFICATION_CACHE);
        await cache.put(`sent:${notificationId}`, new Response(Date.now().toString()));
        
        // Nettoyer les anciennes (plus de 7 jours)
        const keys = await cache.keys();
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        
        for (const key of keys) {
            if (key.url.includes('sent:')) {
                const response = await cache.match(key);
                if (response) {
                    const timestamp = parseInt(await response.text());
                    if (timestamp < sevenDaysAgo) {
                        await cache.delete(key);
                    }
                }
            }
        }
    } catch (error) {
        console.error('[SW] Erreur marquage:', error);
    }
}

async function getLastStudentId() {
    try {
        const cache = await caches.open(NOTIFICATION_CACHE);
        const response = await cache.match('last-student-id');
        if (response) {
            return await response.text();
        }
    } catch (error) {}
    return null;
}

async function getStudentPromotion(studentId) {
    // Récupérer depuis Firestore via API REST
    try {
        const response = await fetch(
            `https://firestore.googleapis.com/v1/projects/fsa-unilu/databases/(default)/documents/etudiants/${studentId}`,
            { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        );
        
        if (response.ok) {
            const data = await response.json();
            return data.fields?.promotion?.stringValue || null;
        }
    } catch (error) {
        console.error('[SW] Erreur récupération promotion:', error);
    }
    return null;
}

// ==================== SYNCHRONISATION EN ARRIÈRE-PLAN ====================
self.addEventListener('sync', event => {
    console.log('[SW] 📡 Sync événement:', event.tag);
    
    if (event.tag === 'sync-notifications') {
        event.waitUntil(checkNewNotifications());
    }
});

// ==================== MESSAGES DU CLIENT ====================
self.addEventListener('message', event => {
    console.log('[SW] Message reçu:', event.data?.type);
    
    switch (event.data?.type) {
        case 'SAVE_STUDENT_SESSION':
            saveStudentSession(event.data.studentId);
            break;
            
        case 'CHECK_NOTIFICATIONS_NOW':
            event.waitUntil(checkNewNotifications());
            break;
            
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CLEAR_NOTIFICATIONS_CACHE':
            clearNotificationsCache();
            break;
    }
});

async function saveStudentSession(studentId) {
    if (!studentId) return;
    try {
        const cache = await caches.open(NOTIFICATION_CACHE);
        await cache.put('last-student-id', new Response(studentId));
        console.log('[SW] Session étudiant sauvegardée:', studentId);
        
        // Vérifier immédiatement
        setTimeout(() => checkNewNotifications(), 1000);
    } catch (error) {
        console.error('[SW] Erreur sauvegarde session:', error);
    }
}

async function clearNotificationsCache() {
    try {
        const cache = await caches.open(NOTIFICATION_CACHE);
        const keys = await cache.keys();
        for (const key of keys) {
            await cache.delete(key);
        }
        console.log('[SW] Cache notifications nettoyé');
    } catch (error) {
        console.error('[SW] Erreur nettoyage:', error);
    }
}

// ==================== NOTIFICATIONS PUSH (pour futur) ====================
self.addEventListener('push', event => {
    console.log('[SW] Push reçu');
    
    let data = {
        title: 'Faculté Agronomique',
        body: 'Nouvelle information',
        icon: 'icon-192x192.png',
        tag: 'push-' + Date.now()
    };
    
    if (event.data) {
        try {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: 'icon-96x96.png',
            tag: data.tag,
            vibrate: [200, 100, 200],
            requireInteraction: true,
            data: { url: data.url || '/communiquer.html' }
        })
    );
});

// ==================== CLIC SUR NOTIFICATION ====================
self.addEventListener('notificationclick', event => {
    console.log('[SW] Clic notification:', event.notification.tag);
    event.notification.close();
    
    const url = event.notification.data?.url || '/communiquer.html';
    const notificationId = event.notification.data?.notificationId;
    
    let finalUrl = url;
    if (notificationId) {
        finalUrl += (url.includes('?') ? '&' : '?') + 'communique=' + notificationId;
    }
    
    if (event.action === 'close') return;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(windowClients => {
                for (const client of windowClients) {
                    if (client.url.includes('/') && 'focus' in client) {
                        client.postMessage({ type: 'OPEN_NOTIFICATION', notificationId: notificationId });
                        return client.focus();
                    }
                }
                if (clients.openWindow) return clients.openWindow(finalUrl);
            })
    );
});

// ==================== STRATÉGIE DE CACHE ====================
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Ne pas cacher les requêtes Firebase
    if (url.hostname.includes('firebase') || 
        url.hostname.includes('googleapis') ||
        url.hostname.includes('firestore')) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // Stratégie Network First
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200 && event.request.method === 'GET') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
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

console.log('[SW] ✅ Service Worker v4 actif avec notifications optimisées');