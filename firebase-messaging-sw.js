// firebase-messaging-sw.js
// CE FICHIER EST OBLIGATOIRE pour les notifications en arrière-plan

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBb82N2-5ns7qKjQBAj5UvDW87s2PZ27F0",
    authDomain: "fsa-unilu.firebaseapp.com",
    projectId: "fsa-unilu",
    storageBucket: "fsa-unilu.firebasestorage.app",
    messagingSenderId: "36551990738",
    appId: "1:36551990738:web:e91fdcb53f8aab5d1b7c0b"
});

const messaging = firebase.messaging();

// 🔔 RECEPTION NOTIFICATION EN ARRIERE-PLAN (application fermée)
messaging.onBackgroundMessage((payload) => {
    console.log('[FCM] 📨 Message reçu en arrière-plan:', payload);
    
    const notificationTitle = payload.notification?.title || 'Faculté Agronomique';
    const notificationOptions = {
        body: payload.notification?.body || 'Nouvelle information',
        icon: '/icon-192x192.png',
        badge: '/icon-96x96.png',
        tag: payload.data?.tag || 'notif-' + Date.now(),
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        renotify: true,
        data: {
            url: payload.data?.url || '/communiquer.html',
            type: payload.data?.type || 'communique',
            id: payload.data?.id || '',
            click_action: payload.fcmOptions?.link || '/communiquer.html'
        },
        actions: [
            { action: 'open', title: '📖 Ouvrir', icon: '/icon-96x96.png' },
            { action: 'close', title: '✕ Fermer', icon: '/icon-96x96.png' }
        ]
    };
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 🔔 CLIC SUR NOTIFICATION
self.addEventListener('notificationclick', (event) => {
    console.log('[FCM] 🔔 Clic notification:', event.notification.tag);
    event.notification.close();
    
    const url = event.notification.data?.url || '/';
    const notificationId = event.notification.data?.id;
    const notificationType = event.notification.data?.type;
    
    let finalUrl = url;
    if (notificationId && notificationType === 'communique') {
        finalUrl = `communiquer.html?communique=${notificationId}`;
    }
    
    if (event.action === 'close') return;
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                for (const client of windowClients) {
                    if (client.url.includes('/') && 'focus' in client) {
                        client.postMessage({ type: 'OPEN_NOTIFICATION', url: finalUrl, id: notificationId });
                        return client.focus();
                    }
                }
                if (clients.openWindow) return clients.openWindow(finalUrl);
            })
    );
});

console.log('[FCM] ✅ Service Worker FCM prêt');
