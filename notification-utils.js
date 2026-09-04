// ================================================================
// notification-utils.js
// Gestion centralisée des notifications FCM
// Hybrilink — Faculté Agronomique UNILU
// ================================================================

'use strict';

// ================================================================
// CONFIGURATION
// ================================================================

const FSA_APP_SCOPE = '/Espace-etudiant/';

const FSA_VAPID_KEY =
    'BNDQ5l-Vf4yBzUl6wAZ0gBurHoJQG78zf173r-jsOderVcWBor0LjEsqzr11FegBTpRH-O-pb7xXzSTO00xMRP0';

const FSA_SW_PATH = 'sw.js';

const FSA_FCM_TOKEN_KEY = 'fsa_fcm_token';
const FSA_FCM_USER_KEY = 'fsa_fcm_user';
const FSA_FCM_REGISTERED_KEY = 'fsa_fcm_registered';

// ================================================================
// CLASSE PRINCIPALE
// ================================================================

class NotificationManager {

    constructor() {

        this.token = null;

        this.etudiantId = null;

        this.etudiantNom = '';

        this.promotion = '';

        this.messaging = null;

        this.serviceWorkerRegistration = null;

        this.isInitialized = false;

        this.foregroundListenerAttached = false;

        this.isRegistering = false;

    }

    // ============================================================
    // SERVICE WORKER
    // ============================================================

    async getServiceWorkerRegistration() {

        if (!('serviceWorker' in navigator)) {

            console.warn(
                '[FSA-NOTIF] Service Worker non supporté'
            );

            return null;
        }

        try {

            /*
             * Chercher d'abord une registration
             * appartenant exactement à notre application.
             */

            let registration =
                await navigator.serviceWorker.getRegistration(
                    FSA_APP_SCOPE
                );

            /*
             * Si elle existe déjà, vérifier que c'est
             * bien notre sw.js.
             */

            if (registration) {

                const scriptURL =
                    registration.active?.scriptURL ||
                    registration.waiting?.scriptURL ||
                    registration.installing?.scriptURL ||
                    '';

                /*
                 * Si un ancien firebase-messaging-sw.js
                 * contrôle encore cette portée, on le retire.
                 */

                if (
                    scriptURL &&
                    scriptURL.includes(
                        'firebase-messaging-sw.js'
                    )
                ) {

                    console.log(
                        '[FSA-NOTIF] Ancien FCM SW détecté, suppression...'
                    );

                    await registration.unregister();

                    registration = null;
                }

            }

            /*
             * Enregistrer notre Service Worker principal.
             */

            if (!registration) {

                registration =
                    await navigator.serviceWorker.register(
                        FSA_SW_PATH,
                        {
                            scope: FSA_APP_SCOPE
                        }
                    );

                console.log(
                    '[FSA-NOTIF] Service Worker enregistré :',
                    registration.scope
                );
            }

            /*
             * Attendre que le SW soit prêt.
             */

            await navigator.serviceWorker.ready;

            this.serviceWorkerRegistration =
                registration;

            return registration;

        } catch (error) {

            console.error(
                '[FSA-NOTIF] Erreur Service Worker :',
                error
            );

            return null;
        }
    }

    // ============================================================
    // SUPPRESSION DES ANCIENS SERVICE WORKERS
    // ============================================================

    async nettoyerAnciensServiceWorkers() {

        if (!('serviceWorker' in navigator)) {
            return;
        }

        try {

            const registrations =
                await navigator.serviceWorker.getRegistrations();

            for (
                const registration
                of registrations
            ) {

                const scriptURL =
                    registration.active?.scriptURL ||
                    registration.waiting?.scriptURL ||
                    registration.installing?.scriptURL ||
                    '';

                const scope =
                    registration.scope || '';

                /*
                 * Ancien firebase-messaging-sw.js
                 */

                if (
                    scriptURL.includes(
                        'firebase-messaging-sw.js'
                    )
                ) {

                    console.log(
                        '[FSA-NOTIF] Suppression ancien firebase-messaging-sw.js'
                    );

                    await registration.unregister();

                    continue;
                }

                /*
                 * Ancienne portée FCM dédiée.
                 */

                if (
                    scope.includes(
                        'firebase-cloud-messaging-push-scope'
                    )
                ) {

                    console.log(
                        '[FSA-NOTIF] Suppression ancienne portée FCM'
                    );

                    await registration.unregister();

                    continue;
                }

                /*
                 * Ancienne version du sw.js installée
                 * à la racine du domaine.
                 *
                 * On ne la supprime que si elle correspond
                 * bien au Service Worker de cette application.
                 */

                if (
                    scriptURL.endsWith('/sw.js') &&
                    scope ===
                        window.location.origin + '/'
                ) {

                    console.log(
                        '[FSA-NOTIF] Suppression ancien SW racine'
                    );

                    await registration.unregister();
                }

            }

        } catch (error) {

            console.warn(
                '[FSA-NOTIF] Nettoyage SW impossible :',
                error
            );
        }
    }

    // ============================================================
    // INITIALISATION FIREBASE MESSAGING
    // ============================================================

    initialiserMessaging() {

        try {

            if (
                typeof firebase === 'undefined'
            ) {

                console.error(
                    '[FSA-NOTIF] Firebase n’est pas chargé'
                );

                return null;
            }

            /*
             * firebase.messaging() peut être appelé
             * après firebase.initializeApp().
             */

            this.messaging =
                firebase.messaging();

            return this.messaging;

        } catch (error) {

            console.error(
                '[FSA-NOTIF] Firebase Messaging indisponible :',
                error
            );

            return null;
        }
    }

    // ============================================================
    // INITIALISATION GÉNÉRALE
    // ============================================================

    async init(
        etudiantId,
        etudiantNom = '',
        promotion = ''
    ) {

        /*
         * L'identifiant étudiant est obligatoire.
         */

        if (!etudiantId) {

            console.warn(
                '[FSA-NOTIF] Aucun identifiant étudiant'
            );

            return null;
        }

        this.etudiantId =
            String(etudiantId);

        this.etudiantNom =
            etudiantNom || '';

        this.promotion =
            promotion || '';

        /*
         * Nettoyer les anciennes registrations.
         */

        await this.nettoyerAnciensServiceWorkers();

        /*
         * Installer / récupérer le SW principal.
         */

        const registration =
            await this.getServiceWorkerRegistration();

        if (!registration) {
            return null;
        }

        /*
         * Si Firebase Messaging n'est pas encore initialisé.
         */

        if (!this.messaging) {

            this.initialiserMessaging();
        }

        if (!this.messaging) {
            return null;
        }

        /*
         * Ne jamais demander automatiquement
         * la permission si l'utilisateur ne l'a pas encore donnée.
         *
         * Si elle est déjà accordée, on peut enregistrer
         * automatiquement le token.
         */

        if (
            typeof Notification !== 'undefined' &&
            Notification.permission === 'granted'
        ) {

            return await this.registerToken(
                etudiantNom,
                promotion,
                false
            );
        }

        /*
         * Permission refusée.
         */

        if (
            typeof Notification !== 'undefined' &&
            Notification.permission === 'denied'
        ) {

            console.warn(
                '[FSA-NOTIF] Notifications refusées par le navigateur'
            );

            this.isInitialized = true;

            return null;
        }

        /*
         * Permission par défaut :
         * on n'affiche pas automatiquement la demande.
         */

        this.isInitialized = true;

        return null;
    }

    // ============================================================
    // DEMANDE DE PERMISSION
    // ============================================================

    async requestPermissionAndRegister(
        etudiantId = this.etudiantId,
        etudiantNom = this.etudiantNom,
        promotion = this.promotion
    ) {

        if (!etudiantId) {

            console.warn(
                '[FSA-NOTIF] Identifiant étudiant manquant'
            );

            return null;
        }

        this.etudiantId =
            String(etudiantId);

        this.etudiantNom =
            etudiantNom || '';

        this.promotion =
            promotion || '';

        /*
         * Vérification de la compatibilité.
         */

        if (
            typeof Notification === 'undefined'
        ) {

            console.warn(
                '[FSA-NOTIF] Notification API non disponible'
            );

            return null;
        }

        if (
            !('serviceWorker' in navigator)
        ) {

            console.warn(
                '[FSA-NOTIF] Service Worker non disponible'
            );

            return null;
        }

        /*
         * Certaines versions d'iOS nécessitent
         * que l'application soit installée sur l'écran
         * d'accueil pour les notifications Web Push.
         *
         * On laisse toutefois le navigateur gérer
         * la demande de permission.
         */

        try {

            /*
             * Installer d'abord le SW.
             */

            await this.nettoyerAnciensServiceWorkers();

            const registration =
                await this.getServiceWorkerRegistration();

            if (!registration) {
                return null;
            }

            /*
             * Initialiser Firebase Messaging.
             */

            if (!this.messaging) {
                this.initialiserMessaging();
            }

            if (!this.messaging) {
                return null;
            }

            /*
             * Demander la permission.
             */

            let permission =
                Notification.permission;

            if (
                permission === 'default'
            ) {

                permission =
                    await Notification.requestPermission();
            }

            /*
             * Refus.
             */

            if (
                permission !== 'granted'
            ) {

                console.warn(
                    '[FSA-NOTIF] Permission notifications :',
                    permission
                );

                this.isInitialized = true;

                return null;
            }

            /*
             * Permission accordée.
             */

            return await this.registerToken(
                etudiantNom,
                promotion,
                false
            );

        } catch (error) {

            console.error(
                '[FSA-NOTIF] Erreur demande permission :',
                error
            );

            return null;
        }
    }

    // ============================================================
    // ENREGISTREMENT DU TOKEN FCM
    // ============================================================

    async registerToken(
        etudiantNom = '',
        promotion = '',
        requestPermission = false
    ) {

        if (this.isRegistering) {

            console.log(
                '[FSA-NOTIF] Enregistrement déjà en cours'
            );

            return this.token;
        }

        this.isRegistering = true;

        try {

            if (!this.etudiantId) {

                console.warn(
                    '[FSA-NOTIF] Aucun étudiant configuré'
                );

                return null;
            }

            /*
             * Vérifier Notification API.
             */

            if (
                typeof Notification === 'undefined'
            ) {

                console.warn(
                    '[FSA-NOTIF] Notification API indisponible'
                );

                return null;
            }

            /*
             * Permission.
             */

            let permission =
                Notification.permission;

            if (
                requestPermission &&
                permission === 'default'
            ) {

                permission =
                    await Notification.requestPermission();
            }

            if (
                permission !== 'granted'
            ) {

                return null;
            }

            /*
             * Récupérer le SW principal.
             */

            const registration =
                await this.getServiceWorkerRegistration();

            if (!registration) {
                return null;
            }

            /*
             * Initialiser Messaging.
             */

            if (!this.messaging) {

                this.initialiserMessaging();
            }

            if (!this.messaging) {
                return null;
            }

            /*
             * Récupérer le token FCM.
             *
             * IMPORTANT :
             * On fournit explicitement notre SW principal.
             */

            const token =
                await this.messaging.getToken({
                    vapidKey: FSA_VAPID_KEY,
                    serviceWorkerRegistration:
                        registration
                });

            if (!token) {

                console.warn(
                    '[FSA-NOTIF] Aucun token FCM reçu'
                );

                return null;
            }

            this.token = token;

            /*
             * Sauvegarder localement.
             */

            localStorage.setItem(
                FSA_FCM_TOKEN_KEY,
                token
            );

            localStorage.setItem(
                FSA_FCM_USER_KEY,
                this.etudiantId
            );

            localStorage.setItem(
                FSA_FCM_REGISTERED_KEY,
                'true'
            );

            /*
             * Sauvegarder dans Firestore.
             */

            await this.saveTokenToFirestore(
                token,
                etudiantNom,
                promotion
            );

            /*
             * Installer le listener foreground
             * une seule fois.
             */

            this.setupForegroundListener();

            this.isInitialized = true;

            console.log(
                '[FSA-NOTIF] Token FCM enregistré avec succès'
            );

            return token;

        } catch (error) {

            console.error(
                '[FSA-NOTIF] Erreur enregistrement token :',
                error
            );

            return null;

        } finally {

            this.isRegistering = false;
        }
    }

    // ============================================================
    // SAUVEGARDE DU TOKEN FIRESTORE
    // ============================================================

    async saveTokenToFirestore(
        token,
        etudiantNom = '',
        promotion = ''
    ) {

        try {

            /*
             * Utiliser db global déjà initialisé
             * par la page HTML.
             */

            if (
                typeof db === 'undefined' ||
                !db
            ) {

                console.error(
                    '[FSA-NOTIF] Instance Firestore "db" introuvable'
                );

                return false;
            }

            const tokenRef =
                db.collection('fcmTokens')
                  .doc(this.etudiantId);

            /*
             * Le backend actuel utilise :
             *
             * fcmTokens/{studentId}
             *
             * avec le champ :
             *
             * token
             */

            await tokenRef.set(
                {
                    token: token,

                    studentId:
                        this.etudiantId,

                    etudiantId:
                        this.etudiantId,

                    etudiantNom:
                        etudiantNom || '',

                    promotion:
                        promotion || '',

                    platform:
                        this.detectPlatform(),

                    userAgent:
                        navigator.userAgent,

                    lastActive:
                        firebase.firestore.FieldValue.serverTimestamp(),

                    updatedAt:
                        firebase.firestore.FieldValue.serverTimestamp()

                },
                {
                    merge: true
                }
            );

            console.log(
                '[FSA-NOTIF] Token sauvegardé dans Firestore'
            );

            return true;

        } catch (error) {

            console.error(
                '[FSA-NOTIF] Erreur sauvegarde Firestore :',
                error
            );

            return false;
        }
    }

    // ============================================================
    // LISTENER NOTIFICATIONS AU PREMIER PLAN
    // ============================================================

    setupForegroundListener() {

        /*
         * Éviter plusieurs listeners.
         */

        if (
            this.foregroundListenerAttached
        ) {

            return;
        }

        if (!this.messaging) {

            this.initialiserMessaging();
        }

        if (!this.messaging) {
            return;
        }

        try {

            this.messaging.onMessage(
                payload => {

                    console.log(
                        '[FSA-NOTIF] Notification au premier plan :',
                        payload
                    );

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

                    /*
                     * Lorsque l'application est ouverte,
                     * le navigateur n'affiche pas forcément
                     * une notification système.
                     *
                     * On affiche donc un toast local.
                     */

                    this.showForegroundNotification(
                        title,
                        body,
                        data
                    );

                    /*
                     * Petit signal sonore si possible.
                     */

                    this.playNotificationSound();

                    /*
                     * Événement personnalisé pour les pages
                     * qui veulent réagir à la notification.
                     */

                    try {

                        window.dispatchEvent(
                            new CustomEvent(
                                'fsa:notification',
                                {
                                    detail: {
                                        title:
                                            title,

                                        body:
                                            body,

                                        data:
                                            data,

                                        payload:
                                            payload
                                    }
                                }
                            )
                        );

                    } catch (error) {

                        console.warn(
                            '[FSA-NOTIF] Événement personnalisé impossible'
                        );
                    }

                }
            );

            this.foregroundListenerAttached =
                true;

        } catch (error) {

            console.error(
                '[FSA-NOTIF] Impossible d'installer le listener foreground :',
                error
            );
        }
    }

    // ============================================================
    // AFFICHAGE NOTIFICATION PREMIER PLAN
    // ============================================================

    showForegroundNotification(
        title,
        body,
        data = {}
    ) {

        /*
         * Si la page possède déjà sa propre fonction
         * showToast(), on l'utilise.
         */

        try {

            if (
                typeof window.showToast ===
                'function'
            ) {

                window.showToast(
                    `🔔 ${title}: ${body}`,
                    'info'
                );

                return;
            }

        } catch (error) {
            // Continuer avec notre propre toast.
        }

        /*
         * Sinon créer un toast indépendant.
         */

        this.createFallbackToast(
            title,
            body
        );
    }

    // ============================================================
    // TOAST DE SECOURS
    // ============================================================

    createFallbackToast(
        title,
        body
    ) {

        let container =
            document.getElementById(
                'fsa-notification-container'
            );

        if (!container) {

            container =
                document.createElement('div');

            container.id =
                'fsa-notification-container';

            container.style.position =
                'fixed';

            container.style.top =
                '20px';

            container.style.right =
                '20px';

            container.style.zIndex =
                '999999';

            container.style.display =
                'flex';

            container.style.flexDirection =
                'column';

            container.style.gap =
                '10px';

            container.style.maxWidth =
                'calc(100vw - 40px)';

            document.body.appendChild(
                container
            );
        }

        const toast =
            document.createElement('div');

        toast.style.background =
            '#003366';

        toast.style.color =
            '#ffffff';

        toast.style.padding =
            '14px 16px';

        toast.style.borderRadius =
            '12px';

        toast.style.boxShadow =
            '0 8px 30px rgba(0,0,0,.25)';

        toast.style.fontFamily =
            'Arial, sans-serif';

        toast.style.fontSize =
            '14px';

        toast.style.lineHeight =
            '1.4';

        toast.style.cursor =
            'pointer';

        toast.innerHTML = `
            <div style="
                font-weight:700;
                margin-bottom:4px;
            ">
                🔔 ${this.escapeHtml(title)}
            </div>

            <div>
                ${this.escapeHtml(body)}
            </div>
        `;

        toast.addEventListener(
            'click',
            () => {

                toast.remove();

            }
        );

        container.appendChild(
            toast
        );

        setTimeout(
            () => {

                if (
                    toast &&
                    toast.parentNode
                ) {

                    toast.remove();
                }

            },
            6000
        );
    }

    // ============================================================
    // SON DE NOTIFICATION
    // ============================================================

    playNotificationSound() {

        try {

            /*
             * Ne pas générer de son si le navigateur
             * bloque l'audio automatique.
             */

            const AudioContext =
                window.AudioContext ||
                window.webkitAudioContext;

            if (!AudioContext) {
                return;
            }

            const context =
                new AudioContext();

            const oscillator =
                context.createOscillator();

            const gain =
                context.createGain();

            oscillator.type =
                'sine';

            oscillator.frequency.value =
                880;

            gain.gain.setValueAtTime(
                0.0001,
                context.currentTime
            );

            gain.gain.exponentialRampToValueAtTime(
                0.08,
                context.currentTime + 0.01
            );

            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                context.currentTime + 0.20
            );

            oscillator.connect(
                gain
            );

            gain.connect(
                context.destination
            );

            oscillator.start();

            oscillator.stop(
                context.currentTime + 0.20
            );

            setTimeout(
                () => {

                    try {
                        context.close();
                    } catch (error) {}

                },
                500
            );

        } catch (error) {

            /*
             * L'audio est facultatif.
             */

            console.log(
                '[FSA-NOTIF] Audio non disponible'
            );
        }
    }

    // ============================================================
    // DÉTECTION PLATEFORME
    // ============================================================

    detectPlatform() {

        const ua =
            navigator.userAgent ||
            '';

        if (
            /iPhone|iPad|iPod/i.test(ua)
        ) {

            return 'ios';
        }

        if (
            /Android/i.test(ua)
        ) {

            return 'android';
        }

        if (
            /Windows/i.test(ua)
        ) {

            return 'windows';
        }

        if (
            /Macintosh|Mac OS X/i.test(ua)
        ) {

            return 'macos';
        }

        return 'web';
    }

    // ============================================================
    // STATUT DES NOTIFICATIONS
    // ============================================================

    isActive() {

        if (
            typeof Notification ===
            'undefined'
        ) {

            return false;
        }

        return (
            Notification.permission ===
            'granted' &&
            !!this.token
        );
    }

    getPermissionStatus() {

        if (
            typeof Notification ===
            'undefined'
        ) {

            return 'unsupported';
        }

        return Notification.permission;
    }

    // ============================================================
    // RÉCUPÉRER LE TOKEN
    // ============================================================

    getToken() {

        return (
            this.token ||
            localStorage.getItem(
                FSA_FCM_TOKEN_KEY
            ) ||
            null
        );
    }

    // ============================================================
    // RÉCUPÉRER L'UTILISATEUR DU TOKEN LOCAL
    // ============================================================

    getTokenUser() {

        return localStorage.getItem(
            FSA_FCM_USER_KEY
        );
    }

    // ============================================================
    // VÉRIFIER SI LE TOKEN APPARTIENT À L'ÉTUDIANT
    // ============================================================

    hasTokenForStudent(
        etudiantId
    ) {

        if (!etudiantId) {
            return false;
        }

        const savedUser =
            localStorage.getItem(
                FSA_FCM_USER_KEY
            );

        const savedToken =
            localStorage.getItem(
                FSA_FCM_TOKEN_KEY
            );

        return (
            savedUser ===
                String(etudiantId) &&
            !!savedToken
        );
    }

    // ============================================================
    // ACTUALISER LES DONNÉES DU TOKEN
    // ============================================================

    async refreshStudentData(
        etudiantNom = '',
        promotion = ''
    ) {

        if (!this.token) {

            return false;
        }

        return await this.saveTokenToFirestore(
            this.token,
            etudiantNom,
            promotion
        );
    }

    // ============================================================
    // SUPPRESSION TOKEN FIRESTORE
    // ============================================================

    async removeRemoteToken() {

        if (!this.etudiantId) {
            return false;
        }

        try {

            if (
                typeof db === 'undefined' ||
                !db
            ) {

                return false;
            }

            await db
                .collection('fcmTokens')
                .doc(this.etudiantId)
                .delete();

            console.log(
                '[FSA-NOTIF] Token supprimé de Firestore'
            );

            return true;

        } catch (error) {

            console.error(
                '[FSA-NOTIF] Suppression token impossible :',
                error
            );

            return false;
        }
    }

    // ============================================================
    // RÉINITIALISATION LOCALE
    // ============================================================

    async reset(
        deleteRemote = false
    ) {

        if (
            deleteRemote &&
            this.etudiantId
        ) {

            await this.removeRemoteToken();
        }

        this.token = null;

        this.etudiantId = null;

        this.etudiantNom = '';

        this.promotion = '';

        this.isInitialized = false;

        this.foregroundListenerAttached =
            false;

        localStorage.removeItem(
            FSA_FCM_TOKEN_KEY
        );

        localStorage.removeItem(
            FSA_FCM_USER_KEY
        );

        localStorage.removeItem(
            FSA_FCM_REGISTERED_KEY
        );

        console.log(
            '[FSA-NOTIF] Gestionnaire réinitialisé'
        );
    }

    // ============================================================
    // FONCTION OBSOLÈTE
    // ============================================================

    async envoyerNotification() {

        /*
         * IMPORTANT :
         *
         * Cette fonction n'envoie plus de notification
         * depuis le navigateur.
         *
         * Les notifications doivent maintenant être envoyées
         * uniquement par Cloud Functions → FCM.
         *
         * Cela évite :
         *
         * - les doublons ;
         * - l'exposition de l'URL HTTP d'envoi ;
         * - les notifications envoyées plusieurs fois ;
         * - les problèmes lorsque plusieurs pages sont ouvertes.
         */

        console.warn(
            '[FSA-NOTIF] envoyerNotification() est désactivée. Utiliser Cloud Functions.'
        );

        return false;
    }

    // ============================================================
    // ÉCHAPPER HTML
    // ============================================================

    escapeHtml(value) {

        const div =
            document.createElement('div');

        div.textContent =
            value == null
                ? ''
                : String(value);

        return div.innerHTML;
    }

}

// ================================================================
// INSTANCE GLOBALE
// ================================================================

window.notificationManager =
    new NotificationManager();

// ================================================================
// FONCTION GLOBALE SERVICE WORKER
// ================================================================

window.registerAppServiceWorker =
    async function () {

        return await window
            .notificationManager
            .getServiceWorkerRegistration();

    };

// ================================================================
// FONCTION GLOBALE DEMANDE NOTIFICATION
// ================================================================

window.enableStudentNotifications =
    async function (
        etudiantId,
        etudiantNom = '',
        promotion = ''
    ) {

        return await window
            .notificationManager
            .requestPermissionAndRegister(
                etudiantId,
                etudiantNom,
                promotion
            );

    };

// ================================================================
// FONCTION GLOBALE STATUT
// ================================================================

window.getStudentNotificationStatus =
    function () {

        return window
            .notificationManager
            .getPermissionStatus();

    };

// ================================================================
// INITIALISATION SILENCIEUSE
// ================================================================

document.addEventListener(
    'DOMContentLoaded',
    () => {

        /*
         * Le gestionnaire est disponible dès que
         * notification-utils.js est chargé.
         *
         * On ne demande aucune permission automatiquement.
         */

        console.log(
            '[FSA-NOTIF] Gestionnaire de notifications prêt'
        );

    }
);

// ================================================================
// FIN
// ================================================================

console.log(
    '[FSA-NOTIF] notification-utils.js chargé'
);
