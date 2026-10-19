# Journal des modifications (audit log) — FluxerHooks Desktop

Historique de chaque version de **FluxerHooks Desktop** (Linux), numérotée séparément de l'app Mobile (`beta-0.0.<N>`, branche `desktop-beta-0.0.<N>`) : **ajouts**, **modifications** et **correctifs**.

> Ce fichier est la source des descriptions des releases Desktop (tags `desktop-b0.0.<N>`, dernière version sur `desktop-latest`) : chaque section `## beta-0.0.<N>` est reprise telle quelle (`scripts/release-notes.js`).
> **À chaque nouvelle version Desktop, ajouter une section `## beta-0.0.<N>` en haut de ce fichier** et mettre à jour `fluxerhooksVersion` dans `desktop/package.json`.

Légende : ✨ Ajouts · 🔧 Modifications · 🐛 Correctifs · 🏗️ Build / technique

---

## beta-0.0.3

**Connexion d'appareils et synchro en temps réel sur le même Wi-Fi** — branche `desktop` · 18–19 oct. 2026

### ✨ Ajouts
- **Connexion d'appareils** (Paramètres → **Appareils**) : FluxerHooks Desktop affiche un **QR code** (« Connecter un appareil »), le téléphone le scanne (« Scanner le QR code ») ; entre deux ordinateurs, le code se copie et se colle (« Saisir un code »).
- Les deux appareils doivent être **connectés au même compte Fluxer** : sinon la liaison est refusée, et la synchro s'arrête si l'un d'eux passe sur un autre compte.
- **Synchro automatique** entre appareils liés dès qu'ils sont sur le **même Wi-Fi** avec l'app ouverte : brouillon, historique, sauvegardes, modèles, automatisations et paramètres. Pour chaque élément, la modification la plus récente gagne ; un modèle ajouté sur un appareil et un autre sur le second sont tous deux gardés, et une suppression se propage.
- Au moment de la liaison, choix des **données de départ** : fusionner, garder celles de cet appareil ou prendre celles de l'autre.
- Liste des **appareils connectés au compte Fluxer** (type, système, lieu approximatif, dernière activité, « Cet appareil »), et des appareils liés à FluxerHooks avec leur état (« Synchronisé à… », « Introuvable sur le réseau »…), possibilité de les délier.
- Aucun serveur ni note personnelle Fluxer : les données passent directement d'un appareil à l'autre, **chiffrées en AES-256-GCM** avec une clé propre à chaque liaison.
- Automatisations : avec des appareils liés, chacune n'est envoyée que par un seul appareil (celui qui l'a exécutée en premier).
- **Synchronisation en temps réel** entre appareils liés : connexion directe permanente (WebSocket chiffrée avec la clé de la liaison) ; les données créées depuis **Données** (bouton « Éditeur » : sauvegardes, modèles, automatisations) et l'**historique** sont envoyés et affichés sur l'autre appareil en moins d'une seconde, sans redémarrer l'app. Le brouillon en cours (éditeur et aperçu) reste propre à chaque appareil.
- Historique fusionné étape par étape : chaque appareil voit les étapes des deux et garde sa propre position pour Annuler / Rétablir ; une étape venue de l'autre appareil se restaure depuis la chronologie.
- Rattrapage automatique à la reconnexion (app rouverte, retour du Wi-Fi) ; statut « Connecté en direct » dans Paramètres → Appareils.

### 🔧 Modifications
- L'instance Fluxer et l'image de fond restent propres à chaque appareil.

### 🏗️ Build / technique
- Serveur local sur le port **47321** (TCP, réseau local), actif seulement quand un appareil est lié ou en cours de liaison ; les requêtes vers les autres appareils passent par le processus principal.
- Le serveur local (port 47321) accepte aussi les connexions en direct (WebSocket, bibliothèque `ws`), relayées vers l'interface.

### 🐛 Correctifs
- **Appareils** : seules les sessions du compte actives depuis la création de FluxerHooks (16 oct. 2026) sont affichées ; chaque appareil n'apparaît qu'une fois (les reconnexions du même appareil sont regroupées) ; cet appareil et les appareils liés sont reconnus par leur session Fluxer et réunis dans une seule liste, sans doublon ni appareil d'exemple.
- Les données reçues d'un appareil lié ne s'affichaient qu'après un arrêt forcé de l'app : sauvegardes, modèles, automatisations, historique et paramètres se mettent maintenant à jour à l'écran, sans fermer l'écran ouvert.
- Une modification faite juste après en avoir reçu une pouvait être ignorée.

## beta-0.0.2

**Transfert des données vers une autre plateforme depuis les Paramètres** — branche `desktop` · 18 oct. 2026

### ✨ Ajouts
- Nouvelle section **« Transférer vers une autre plateforme »** dans les Paramètres : **Exporter mes données** (« Enregistrer sous ») puis **Importer des données** dans FluxerHooks sur un autre appareil (Desktop ⇄ Mobile).
- Le fichier contient le brouillon, l'historique, les sauvegardes, les modèles, les automatisations et les paramètres ; les **comptes Fluxer** sont inclus par défaut, chiffrés par un mot de passe (option désactivable).

## beta-0.0.1

**Première version de FluxerHooks pour Linux** — branche `desktop` · 18 oct. 2026

### ✨ Ajouts
- **AppImage x86_64** avec exactement la même interface et les mêmes fonctionnalités que l'app Mobile : éditeur multi-messages, embeds, aperçu Fluxer, threads et forums, édition de messages envoyés, historique d'édition, sauvegardes, modèles, automatisations, thèmes et CSS, 10 langues, comptes Fluxer multiples.
- **Tokens stockés dans le trousseau du système** (KWallet / GNOME Keyring), équivalent du Keystore Android.
- **CAPTCHA de connexion résolu en natif** sur tous les cœurs.
- **Automatisations en arrière-plan** : l'app reste dans la zone de notification quand la fenêtre est fermée (si au moins une automatisation est active).
- **Transfert des comptes** depuis l'app Mobile : backup complet avec l'option « Include my accounts » (tokens chiffrés par mot de passe), à restaurer sur Linux.
- Export de JSON et de backup via « Enregistrer sous », liens ouverts dans le navigateur.
- Boîtes de confirmation dans le style de l'app, traduites dans les 10 langues.

### 🏗️ Build / technique
- Application Electron (`desktop/`) autour de l'export web d'Expo : protocole `app://`, `safeStorage`, solveur ALTCHA en `worker_threads`, accès à l'API Fluxer sans en-tête Origin (comme l'app Mobile).
- Workflow « Build Linux AppImage » : release Desktop `desktop-latest`.
