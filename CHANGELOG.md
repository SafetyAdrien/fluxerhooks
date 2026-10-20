# Journal des modifications (audit log) — FluxerHooks Desktop

Historique de chaque version de **FluxerHooks Desktop** (Linux), numérotée séparément de l'app Mobile (`beta-0.0.<N>`, branche `desktop-beta-0.0.<N>`) : **ajouts**, **modifications** et **correctifs**.

> Ce fichier est la source des descriptions des releases Desktop (tags `desktop-b0.0.<N>`, dernière version sur `desktop-latest`) : chaque section `## beta-0.0.<N>` est reprise telle quelle (`scripts/release-notes.js`).
> **À chaque nouvelle version Desktop, ajouter une section `## beta-0.0.<N>` en haut de ce fichier** et mettre à jour `fluxerhooksVersion` dans `desktop/package.json`.

Légende : ✨ Ajouts · 🔧 Modifications · 🐛 Correctifs · 🏗️ Build / technique

---

## beta-0.0.4

**Nouvelle page Données, panneau du profil et Guides** — branche `desktop` · 20 oct. 2026

### ✨ Ajouts
- **Page Données refaite en écran complet** (ouverte en touchant « Éditeur ») : **Grand écran** : barre latérale (Bibliothèque, Dossiers, Étiquettes, Outils), liste et panneau de détail côte à côte. **Fenêtre étroite** : onglets Bibliothèque / Automatisations / Transfert, filtres en puces et détail en plein écran.
- **Bibliothèque unifiée** des sauvegardes et des modèles : recherche dans les noms, étiquettes, dossiers et même le texte des messages ; tri (modifiés récemment, créés récemment, nom, nombre de messages) ; filtres par type, épinglés, dossier ou étiquette.
- **Dossiers** colorés (créer, renommer, changer la couleur, supprimer sans perdre leur contenu), **étiquettes** libres et **épingles** (toujours en tête de liste).
- **Détail d'un élément** : aperçu du message, nombre de messages, embeds, webhooks et fichiers, dates de création et de modification ; actions **Ouvrir dans l'éditeur**, **Ajouter au brouillon**, **Dupliquer**, **Enregistrer comme modèle / comme sauvegarde**, **Remplacer par le brouillon**, **Programmer un envoi**, **Exporter le JSON**, renommer, épingler, supprimer.
- **Sélection multiple** (appui long ou « Sélectionner ») : déplacer vers un dossier, étiqueter, épingler, exporter ou supprimer plusieurs éléments d'un coup.
- **Enregistrer le brouillon** en sauvegarde ou en modèle, directement avec un dossier et des étiquettes.
- **Export / import de la bibliothèque** (sauvegardes, modèles, dossiers et étiquettes dans un seul fichier) ; un JSON de message (FluxerHooks, Discohook) s'importe en nouvelle sauvegarde. Un import ajoute toujours, sans rien remplacer.
- **Profil : panneau à droite**, ouvert par le nouveau bouton à droite du changement de compte : onglet **Sauvegardes** (enregistrer le brouillon, rechercher, ouvrir, accès à Données) et onglet **Guides**.
- **Guides** : bien démarrer, mettre en forme le texte, mentions et dates dynamiques, embeds, nom/avatar/fichiers, threads et forums, modifier un message envoyé, bien rédiger, sauvegardes et dossiers, automatisations, historique et appareils. Chaque exemple se copie ou s'ajoute au brouillon, avec son rendu.

### 🔧 Modifications
- Profil : le titre « Mon profil Fluxer » est retiré du header pour gagner de la place.
- L'engrenage des **Paramètres** passe du header de l'éditeur au header du profil ; fermer les Paramètres (ou Données) ouvert depuis le profil ramène au profil.
- Les dossiers, étiquettes et épingles se synchronisent en temps réel entre appareils liés, comme les sauvegardes et les modèles.
- Données : icônes fines dans des boutons carrés arrondis, même style que le bouton retour (importer, enregistrer, filtrer, trier, sélectionner, renommer, épingler).
- Données : les étiquettes se choisissent dans un petit panneau ouvert par l'icône **filtre** (au lieu de la rangée de puces et de la liste de la barre latérale) ; l'étiquette active s'affiche en pastille, avec « Retirer cette étiquette partout ».
- Les modèles intégrés s'affichent dans la langue de l'app ; nouveaux textes traduits dans les 9 langues (dont « Mentions autorisées », qui ne l'était pas).

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
