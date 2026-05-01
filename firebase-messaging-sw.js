// firebase-messaging-sw.js
// CE FICHIER EST OBLIGATOIRE pour les notifications en arrière-plan
// Placez-le à la racine de votre application

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyBb82N2-5ns7qKjQBAj5UvDW87s2PZ27F0",
    authDomain: "fsa-unilu.firebaseapp.com",
    projectId: "fsa-unilu",
    storageBucket: "fsa-unilu.firebasestorage.app",
    messagingSenderId: "36551990738",
    appId: "1:36551990738:web:e91fdcb53f8aab5d1b7c0b"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 🔔 GESTION DES MESSAGES EN ARRIÈRE-PLAN (application fermée)
messaging.onBackgroundMessage((payload) => {
    console.log('[FCM] 📨 Message reçu en arrière-plan:', payload);
    
    const notificationTitle = payload.notification?.title || 'Faculté Agronomique';
    const notificationOptions = {
        body: payload.notification?.body || 'Nouvelle information disponible',
        icon: '/icon-192x192.png',
        badge: '/icon-96x96.png',
        vibrate: [200, 100, 200, 100, 200],
        data: {
            url: payload.data?.url || '/',
            id: payload.data?.id,
            type: payload.data?.type || 'communique',
            click_action: payload.fcmOptions?.link || '/'
        },
        requireInteraction: true,
        actions: [
            {
                action: 'open',
                title: '📖 Voir',
                icon: '/icon-96x96.png'
            },
            {
                action: 'close',
                title: '✕ Fermer',
                icon: '/icon-96x96.png'
            }
        ]
    };
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 🔔 GESTION DU CLIC SUR NOTIFICATION EN ARRIÈRE-PLAN
self.addEventListener('notificationclick', (event) => {
    console.log('[FCM] 🔔 Clic sur notification:', event.notification.data);
    
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
                .then(windowClients => {
                    for (let client of windowClients) {
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

console.log('[FCM] ✅ Service Worker FCM prêt pour notifications arrière-plan');
