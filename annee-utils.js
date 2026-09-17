/* ================================================================
   annee-utils.js
   ================================================================
   
   Module centralisé de gestion de l'année académique active
   pour l'application étudiante de la Faculté des Sciences
   Agronomiques (UNILU).

   FONCTIONNALITÉS :
   -----------------
   1. Écoute temps réel du document Firestore :
      configurations/anneeActive

   2. Détection automatique d'un changement d'année :
      - Mise à jour du badge navbar (anneeBadgeNav)
      - Mise à jour du badge carte étudiant (anneeActiveBadge)
      - Affichage d'un bandeau temporaire
      - Nettoyage des caches locaux
      - Notification au callback de la page

   3. Persistance localStorage pour éviter le clignotement

   4. Filtre strict : appartientAnneeActive(data)
      → Utilisable dans toutes les requêtes Firestore

   5. API simple et uniforme pour toutes les pages :
      - window.AnneeManager.init(db, callback)
      - window.AnneeManager.destroy()
      - window.AnneeManager.appartientAnneeActive(data)
      - window.AnneeManager.chargerDirectement(db)
      - window.AnneeManager.chargerDepuisLocal()
      - window.AnneeManager.getAnnee()
      - window.AnneeManager.mettreAJourBadgeNavbar(nom)
      - window.AnneeManager.afficherBandeauAnnee(nom)

   UTILISATION TYPE DANS UNE PAGE :
   --------------------------------
   
   <script src="annee-utils.js"></script>
   <script>
       const db = firebase.firestore();

       function onAnneeChange(annee, estChangement) {
           if (estChangement) {
               // Recharger les données de la page
               chargerMesDonnees();
           }
       }

       window.AnneeManager.init(db, onAnneeChange);
   </script>

   ================================================================ */

(function (window) {

    'use strict';

    // ============================================================
    // CONSTANTES
    // ============================================================

    const CACHE_KEY_ANNEE = 'annee_active_etudiant';
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours

    const DEBUG = false; // Passer à true pour les logs verbeux

    // ============================================================
    // ÉTAT INTERNE
    // ============================================================

    let _unsubscribeAnnee = null;
    let _callbacks = [];
    let _db = null;
    let _initialise = false;

    // ============================================================
    // LOGGER
    // ============================================================

    function log(...args) {
        if (DEBUG) {
            console.log('[ANNÉE]', ...args);
        }
    }

    function warn(...args) {
        console.warn('[ANNÉE]', ...args);
    }

    function error(...args) {
        console.error('[ANNÉE]', ...args);
    }

    // ============================================================
    // UTILITAIRES
    // ============================================================

    function escapeHtml(text) {

        if (text === null || text === undefined) {
            return '';
        }

        const div = document.createElement('div');

        div.textContent = String(text);

        return div.innerHTML;
    }

    function safeString(value, fallback = '') {

        if (value === null || value === undefined) {
            return fallback;
        }

        return String(value).trim() || fallback;
    }

    // ============================================================
    // BADGE NAVBAR — MISE À JOUR
    // ============================================================

    /**
     * Met à jour TOUS les badges d'année présents dans la page.
     *
     * Badges reconnus :
     *   - #anneeBadgeNav + #anneeBadgeText   (navbar standard)
     *   - #anneeActiveBadge + #anneeActiveText (carte étudiant)
     *   - #anneeWelcomeBadge + #anneeWelcomeText (welcome card)
     *
     * @param {string} nomAnnee
     */
    function mettreAJourBadgeNavbar(nomAnnee) {

        const nom = safeString(nomAnnee, 'Aucune');

        // -------------------------
        // Badge navbar standard
        // -------------------------
        const badgeNav = document.getElementById('anneeBadgeNav');
        const badgeText = document.getElementById('anneeBadgeText');

        if (badgeNav) {

            badgeNav.classList.remove('chargement', 'erreur');

            if (nom === 'Aucune' || nom === 'Erreur') {

                badgeNav.classList.add(
                    nom === 'Erreur' ? 'erreur' : 'chargement'
                );
            }

            badgeNav.title = 'Année académique active : ' + nom;
        }

        if (badgeText) {
            badgeText.textContent = nom;
        }

        // -------------------------
        // Badge carte étudiant
        // -------------------------
        const anneeActiveBadge = document.getElementById('anneeActiveBadge');
        const anneeActiveText = document.getElementById('anneeActiveText');

        if (anneeActiveBadge && anneeActiveText) {

            if (nom && nom !== 'Aucune' && nom !== 'Erreur') {

                anneeActiveText.textContent = nom;
                anneeActiveBadge.style.display = 'inline-block';

            } else {

                anneeActiveBadge.style.display = 'none';
            }
        }

        // -------------------------
        // Badge welcome card (professeur-style)
        // -------------------------
        const welcomeBadge = document.getElementById('anneeWelcomeBadge');
        const welcomeText = document.getElementById('anneeWelcomeText');

        if (welcomeBadge && welcomeText) {

            welcomeText.textContent = nom;

            if (nom && nom !== 'Aucune' && nom !== 'Erreur') {
                welcomeBadge.style.display = 'inline-flex';
            } else {
                welcomeBadge.style.display = 'none';
            }
        }
    }

    // ============================================================
    // BANDEAU TEMPORAIRE
    // ============================================================

    /**
     * Affiche un bandeau temporaire pendant 10 secondes.
     * Un seul bandeau à la fois (remplace l'ancien).
     *
     * @param {string} nomAnnee
     */
    function afficherBandeauAnnee(nomAnnee) {

        const nom = safeString(nomAnnee, '');

        if (!nom) return;

        // Supprimer un éventuel bandeau existant
        const existing = document.getElementById('bandeauAnneeAcademique');

        if (existing) {
            existing.remove();
        }

        const bandeau = document.createElement('div');

        bandeau.id = 'bandeauAnneeAcademique';

        bandeau.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #17a2b8, #138496);
            color: white;
            padding: 14px 20px;
            text-align: center;
            font-weight: bold;
            z-index: 10001;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-size: 14px;
            animation: anneSlideDown 0.4s ease;
        `;

        bandeau.innerHTML = `
            <i class="bi bi-calendar-check-fill" style="font-size:20px;"></i>
            <span>Nouvelle année académique active : <strong>${escapeHtml(nom)}</strong></span>
        `;

        // Ajouter l'animation si elle n'existe pas
        if (!document.getElementById('anneSlideDownStyle')) {

            const style = document.createElement('style');

            style.id = 'anneSlideDownStyle';

            style.textContent = `
                @keyframes anneSlideDown {
                    from {
                        transform: translateY(-100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
            `;

            document.head.appendChild(style);
        }

        document.body.appendChild(bandeau);

        // Disparition automatique
        setTimeout(() => {

            bandeau.style.transition = 'opacity 0.5s';
            bandeau.style.opacity = '0';

            setTimeout(() => {

                if (bandeau.parentNode) {
                    bandeau.remove();
                }

            }, 500);

        }, 10000);
    }

    // ============================================================
    // PERSISTANCE LOCALE
    // ============================================================

    /**
     * Sauvegarde l'année active dans localStorage.
     */
    function sauvegarderLocal(anneeId, anneeNom) {

        try {

            localStorage.setItem(
                CACHE_KEY_ANNEE,
                JSON.stringify({
                    id: anneeId,
                    nom: anneeNom,
                    timestamp: Date.now()
                })
            );

            log('💾 Année sauvegardée localement:', anneeNom);

        } catch (e) {

            warn('Impossible de sauvegarder localement:', e);
        }
    }

    /**
     * Restaure l'année active depuis localStorage.
     * @returns {boolean} true si une année a été restaurée
     */
    function chargerDepuisLocal() {

        try {

            const raw = localStorage.getItem(CACHE_KEY_ANNEE);

            if (!raw) {
                return false;
            }

            const data = JSON.parse(raw);

            if (!data || !data.id || !data.nom) {
                return false;
            }

            // Vérifier expiration
            if (
                data.timestamp &&
                (Date.now() - data.timestamp) > CACHE_TTL
            ) {

                localStorage.removeItem(CACHE_KEY_ANNEE);

                return false;
            }

            window.anneeActiveActuelle = {
                id: data.id,
                anneeNom: data.nom
            };

            mettreAJourBadgeNavbar(data.nom);

            log('📦 Année restaurée depuis localStorage:', data.nom);

            return true;

        } catch (e) {

            warn('Erreur lecture localStorage:', e);

            return false;
        }
    }

    // ============================================================
    // CHARGEMENT DIRECT (fallback)
    // ============================================================

    /**
     * Chargement ponctuel du document configurations/anneeActive.
     * Utile si l'écoute temps réel n'est pas encore établie.
     *
     * @param {Object} db - Instance Firestore
     * @returns {Promise<Object|null>}
     */
    async function chargerDirectement(db) {

        if (!db) {

            error('chargerDirectement: db manquant');

            return null;
        }

        try {

            log('🔄 Chargement direct de l\'année active...');

            const doc = await db
                .collection('configurations')
                .doc('anneeActive')
                .get();

            if (!doc.exists) {

                log('⚠️ Aucune année active configurée');

                mettreAJourBadgeNavbar('Aucune');

                return null;
            }

            const data = doc.data() || {};

            if (!data.anneeId || !data.anneeNom) {

                warn('Document incomplet (anneeId ou anneeNom manquant)');

                mettreAJourBadgeNavbar('Incomplet');

                return null;
            }

            window.anneeActiveActuelle = {
                id: data.anneeId,
                anneeNom: data.anneeNom
            };

            mettreAJourBadgeNavbar(data.anneeNom);

            sauvegarderLocal(data.anneeId, data.anneeNom);

            log('✅ Année chargée directement:', data.anneeNom);

            return window.anneeActiveActuelle;

        } catch (e) {

            error('Erreur chargement direct:', e);

            mettreAJourBadgeNavbar('Erreur');

            return null;
        }
    }

    // ============================================================
    // FILTRE STRICT
    // ============================================================

    /**
     * Vérifie si un document Firestore appartient à l'année active.
     *
     * Compatibilité :
     *   - Si aucune année active n'est configurée → tous les documents passent
     *   - Si le document n'a PAS de champ anneeAcademiqueId → il passe
     *     (documents legacy / anciens)
     *   - Sinon → comparaison stricte avec l'année active
     *
     * Champs supportés (ordre de priorité) :
     *   - anneeAcademiqueId (recommandé)
     *   - anneeId
     *   - annee
     *
     * @param {Object} data - Données du document Firestore
     * @returns {boolean}
     */
    function appartientAnneeActive(data) {

        // Pas d'année active → on laisse passer (compatibilité)
        if (!window.anneeActiveActuelle || !window.anneeActiveActuelle.id) {
            return true;
        }

        if (!data || typeof data !== 'object') {
            return true;
        }

        // Chercher le champ d'année (ordre de priorité)
        const docAnneeId =
            data.anneeAcademiqueId ||
            data.anneeId ||
            data.annee ||
            null;

        // Document sans champ d'année → accepté (legacy)
        if (!docAnneeId) {
            return true;
        }

        // Comparaison stricte
        return docAnneeId === window.anneeActiveActuelle.id;
    }

    // ============================================================
    // NETTOYAGE DES CACHES LOCAUX
    // ============================================================

    /**
     * Vide les caches locaux qui dépendent de l'année académique.
     * Appelé automatiquement lors d'un changement d'année.
     */
    function nettoyerCachesLocaux() {

        try {

            const prefixes = [
                'fsa_cache_communiques_',
                'fsa_cache_notes_',
                'fsa_cache_cotations_',
                'fsa_cache_paiements_',
                'fsa_cache_cartes_',
                'fsa_cache_horaires_',
                'fsa_cache_cours_',
                'fsa_cache_deliberations_',
                'fsa_cache_projets_',
                'fsa_cache_sujets_'
            ];

            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {

                const key = localStorage.key(i);

                if (!key) continue;

                // Vérifier si la clé commence par un préfixe ciblé
                const matches = prefixes.some(p => key.startsWith(p));

                if (matches) {
                    keysToRemove.push(key);
                }

                // Cas particulier : communiqués lus
                if (key === 'communiques_lus') {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(k => {

                try {
                    localStorage.removeItem(k);
                } catch (e) {}
            });

            log(`🧹 ${keysToRemove.length} cache(s) nettoyé(s)`);

            return keysToRemove.length;

        } catch (e) {

            warn('Erreur nettoyage caches:', e);

            return 0;
        }
    }

    // ============================================================
    // NOTIFICATION DES CALLBACKS
    // ============================================================

    /**
     * Appelle tous les callbacks enregistrés.
     *
     * @param {Object} annee - { id, anneeNom }
     * @param {boolean} estChangement - true si vrai changement
     */
    function notifierCallbacks(annee, estChangement) {

        _callbacks.forEach((cb, index) => {

            try {

                cb(annee, estChangement);

            } catch (e) {

                error(
                    `Erreur callback #${index}:`,
                    e
                );
            }
        });
    }

    // ============================================================
    // ÉCOUTE TEMPS RÉEL
    // ============================================================

    /**
     * Initialise l'écoute temps réel du document configurations/anneeActive.
     *
     * @param {Object} db - Instance Firestore
     * @param {Function} onChangement - Callback(annee, estChangement)
     * @returns {Function} Fonction de désabonnement
     */
    function init(db, onChangement) {

        if (!db) {

            error('init: instance Firestore manquante');

            return null;
        }

        _db = db;

        // Ajouter le callback
        if (typeof onChangement === 'function') {

            _callbacks.push(onChangement);
        }

        // ============================================================
        // ÉTAPE 1 : Charger depuis localStorage (immédiat, sans réseau)
        // ============================================================

        chargerDepuisLocal();

        // ============================================================
        // ÉTAPE 2 : Écoute Firestore (temps réel)
        // ============================================================

        if (_unsubscribeAnnee) {

            try {
                _unsubscribeAnnee();
            } catch (e) {}

            _unsubscribeAnnee = null;
        }

        log('🔄 Écoute temps réel activée');

        _unsubscribeAnnee = db
            .collection('configurations')
            .doc('anneeActive')
            .onSnapshot(

                (doc) => {

                    // --------------------------------------------
                    // Cas 1 : Document inexistant
                    // --------------------------------------------
                    if (!doc.exists) {

                        log('⚠️ Document anneeActive introuvable');

                        mettreAJourBadgeNavbar('Aucune');

                        // Si c'était la première détection, on continue
                        if (!_initialise) {

                            _initialise = true;

                            notifierCallbacks(null, false);
                        }

                        return;
                    }

                    // --------------------------------------------
                    // Cas 2 : Document récupéré
                    // --------------------------------------------
                    const data = doc.data() || {};

                    const nouvelId = data.anneeId;
                    const nouveauNom = data.anneeNom;

                    if (!nouvelId || !nouveauNom) {

                        warn('Document anneeActive incomplet');

                        mettreAJourBadgeNavbar('Incomplet');

                        return;
                    }

                    // --------------------------------------------
                    // 2a. PREMIÈRE DÉTECTION
                    // --------------------------------------------
                    if (!window.anneeActiveActuelle) {

                        window.anneeActiveActuelle = {
                            id: nouvelId,
                            anneeNom: nouveauNom
                        };

                        mettreAJourBadgeNavbar(nouveauNom);

                        sauvegarderLocal(nouvelId, nouveauNom);

                        log('✅ Année active détectée:', nouveauNom);

                        // Marquer comme initialisé
                        _initialise = true;

                        // Notifier les callbacks SANS recharger
                        notifierCallbacks(
                            window.anneeActiveActuelle,
                            false
                        );

                        return;
                    }

                    // --------------------------------------------
                    // 2b. ANNÉE IDENTIQUE → rien à faire
                    // --------------------------------------------
                    if (window.anneeActiveActuelle.id === nouvelId) {

                        // Mettre à jour le nom si changement mineur
                        if (
                            window.anneeActiveActuelle.anneeNom !==
                            nouveauNom
                        ) {

                            window.anneeActiveActuelle.anneeNom =
                                nouveauNom;

                            mettreAJourBadgeNavbar(nouveauNom);

                            sauvegarderLocal(nouvelId, nouveauNom);
                        }

                        return;
                    }

                    // --------------------------------------------
                    // 2c. VRAI CHANGEMENT D'ANNÉE
                    // --------------------------------------------
                    log('🔔 Changement détecté !');
                    log('   Ancienne:', window.anneeActiveActuelle);
                    log('   Nouvelle:', { id: nouvelId, anneeNom: nouveauNom });

                    // Sauvegarder l'ancienne valeur pour info
                    const ancienneAnnee = window.anneeActiveActuelle;

                    // Mettre à jour l'état
                    window.anneeActiveActuelle = {
                        id: nouvelId,
                        anneeNom: nouveauNom
                    };

                    // Mise à jour du badge
                    mettreAJourBadgeNavbar(nouveauNom);

                    // Persistance locale
                    sauvegarderLocal(nouvelId, nouveauNom);

                    // Bandeau temporaire
                    afficherBandeauAnnee(nouveauNom);

                    // Nettoyer les caches
                    nettoyerCachesLocaux();

                    // Notifier les callbacks AVEC rechargement
                    notifierCallbacks(
                        window.anneeActiveActuelle,
                        true
                    );

                    log('✅ Basculement terminé');
                },

                (err) => {

                    error('Erreur écoute anneeActive:', err);

                    mettreAJourBadgeNavbar('Erreur');

                    // Tentative de fallback : charger depuis localStorage
                    if (!chargerDepuisLocal()) {

                        // Si pas de cache, essayer un chargement direct
                        chargerDirectement(_db).catch(() => {});
                    }
                }
            );

        return _unsubscribeAnnee;
    }

    // ============================================================
    // DÉTRUIRE L'ÉCOUTE
    // ============================================================

    /**
     * Désabonne l'écoute Firestore et réinitialise l'état.
     * À appeler lors de la déconnexion.
     */
    function destroy() {

        if (_unsubscribeAnnee) {

            try {
                _unsubscribeAnnee();
            } catch (e) {}

            _unsubscribeAnnee = null;
        }

        _callbacks = [];
        _initialise = false;

        log('🛑 Écoute arrêtée');
    }

    // ============================================================
    // RESET COMPLET (pour déconnexion)
    // ============================================================

    /**
     * Reset total : désabonne + vide l'état + supprime le cache.
     * Utiliser à la déconnexion.
     */
    function reset() {

        destroy();

        try {
            localStorage.removeItem(CACHE_KEY_ANNEE);
        } catch (e) {}

        window.anneeActiveActuelle = null;

        log('🔄 Reset complet effectué');
    }

    // ============================================================
    // GETTERS
    // ============================================================

    /**
     * Retourne l'année active actuelle.
     * @returns {Object|null}
     */
    function getAnnee() {

        return window.anneeActiveActuelle;
    }

    /**
     * Retourne l'ID de l'année active.
     * @returns {string|null}
     */
    function getAnneeId() {

        return window.anneeActiveActuelle
            ? window.anneeActiveActuelle.id
            : null;
    }

    /**
     * Retourne le nom de l'année active.
     * @returns {string|null}
     */
    function getAnneeNom() {

        return window.anneeActiveActuelle
            ? window.anneeActiveActuelle.anneeNom
            : null;
    }

    /**
     * Indique si une année est active.
     * @returns {boolean}
     */
    function hasAnneeActive() {

        return !!(
            window.anneeActiveActuelle &&
            window.anneeActiveActuelle.id
        );
    }

    // ============================================================
    // AJOUTER / RETIRER UN CALLBACK DYNAMIQUEMENT
    // ============================================================

    /**
     * Ajoute un callback après l'initialisation.
     * @param {Function} cb
     */
    function onChangement(cb) {

        if (typeof cb === 'function') {

            _callbacks.push(cb);

            // Si l'année est déjà chargée, appeler immédiatement
            if (window.anneeActiveActuelle) {

                try {
                    cb(window.anneeActiveActuelle, false);
                } catch (e) {
                    error('Erreur callback immédiat:', e);
                }
            }
        }
    }

    // ============================================================
    // EXPORT PUBLIC
    // ============================================================

    window.AnneeManager = {

        // Méthodes principales
        init,
        destroy,
        reset,

        // Filtre pour Firestore
        appartientAnneeActive,

        // Chargements
        chargerDirectement,
        chargerDepuisLocal,

        // Getters
        getAnnee,
        getAnneeId,
        getAnneeNom,
        hasAnneeActive,

        // UI
        mettreAJourBadgeNavbar,
        afficherBandeauAnnee,

        // Utilitaires
        nettoyerCachesLocaux,
        onChangement,

        // Constantes
        CACHE_KEY: CACHE_KEY_ANNEE
    };

    log('✅ AnneeManager chargé et prêt');

})(window);