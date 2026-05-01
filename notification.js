// notification.js - Gestion des notifications push
class NotificationManager {
  constructor() {
    this.vapidPublicKey = 'BNDQ5l-Vf4yBzUl6wAZ0gBurHoJQG78zf173r-jsOderVcWBor0LjEsqzr11FegBTpRH-O-pb7xXzSTO00xMRP0';
    this.isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    this.swRegistration = null;
  }
  
  async init() {
    if (!this.isSupported) {
      console.log('Notifications non supportées sur ce navigateur');
      return false;
    }
    
    try {
      this.swRegistration = await navigator.serviceWorker.ready;
      return true;
    } catch (error) {
      console.error('Erreur initialisation notifications:', error);
      return false;
    }
  }
  
  async requestPermission() {
    if (!this.isSupported) return false;
    
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  async subscribeUser() {
    if (!this.isSupported || !this.swRegistration) return null;
    
    try {
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
      });
      
      console.log('Abonnement push:', subscription);
      
      // Sauvegarder l'abonnement dans Firestore
      await this.saveSubscription(subscription);
      
      return subscription;
    } catch (error) {
      console.error('Erreur abonnement push:', error);
      return null;
    }
  }
  
  async unsubscribeUser() {
    if (!this.swRegistration) return false;
    
    try {
      const subscription = await this.swRegistration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await this.deleteSubscription(subscription);
        return true;
      }
    } catch (error) {
      console.error('Erreur désabonnement:', error);
    }
    return false;
  }
  
  async saveSubscription(subscription) {
    // Envoyer l'abonnement au serveur (Firestore)
    const userId = localStorage.getItem('userId');
    if (userId) {
      await db.collection('pushSubscriptions').doc(`${userId}_${subscription.endpoint}`).set({
        userId: userId,
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        userAgent: navigator.userAgent
      });
    }
  }
  
  async deleteSubscription(subscription) {
    const userId = localStorage.getItem('userId');
    if (userId && subscription) {
      const docId = `${userId}_${subscription.endpoint}`;
      await db.collection('pushSubscriptions').doc(docId).delete();
    }
  }
  
  async checkPermission() {
    return Notification.permission;
  }
  
  async showLocalNotification(title, body, icon = 'icon-192x192.png', url = '/') {
    if (this.swRegistration && Notification.permission === 'granted') {
      await this.swRegistration.showNotification(title, {
        body: body,
        icon: icon,
        badge: 'icon-96x96.png',
        vibrate: [200, 100, 200],
        data: { url: url },
        actions: [
          { action: 'open', title: 'Ouvrir', icon: 'icon-96x96.png' },
          { action: 'close', title: 'Fermer' }
        ]
      });
    }
  }
  
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
}

// Créer une instance globale
const notificationManager = new NotificationManager();

// Fonction pour envoyer une notification de nouveau paiement
async function sendNewPaymentNotification(etudiantNom, montant, numeroRecu) {
  if (notificationManager.isSupported && Notification.permission === 'granted') {
    await notificationManager.showLocalNotification(
      '💳 Nouveau paiement enregistré',
      `${etudiantNom} a payé ${montant.toLocaleString()} FC - Reçu: ${numeroRecu}`,
      'icon-192x192.png',
      'paiement.html'
    );
  }
}

// Fonction pour envoyer une notification de rappel
async function sendPaymentReminderNotification(etudiantNom, montantRestant) {
  if (notificationManager.isSupported && Notification.permission === 'granted') {
    await notificationManager.showLocalNotification(
      '⚠️ Rappel de paiement',
      `${etudiantNom}, vous avez un solde de ${montantRestant.toLocaleString()} FC à régler`,
      'icon-192x192.png',
      'paiement.html'
    );
  }
}

// Exporter les fonctions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { notificationManager, sendNewPaymentNotification, sendPaymentReminderNotification };
}