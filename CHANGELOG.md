# Journal des modifications (audit log) — FluxerHooks

Historique complet de chaque version publiée : **ajouts**, **modifications** et **correctifs**.
La correspondance est `versionCode N` = `FluxerHooks-beta-0.0.<N>` (branche `mobile-beta-0.0.<N>`, tag `mobile-b0.0.<N>`). Les noms « v1.x » puis « beta<N> » sont les anciens noms des versions, avant le nommage `beta-0.0.<N>`.

> Ce fichier est la source des descriptions des releases GitHub : chaque section `## beta-0.0.<N>` est reprise telle quelle dans la release correspondante (`scripts/release-notes.js`).
> **À chaque nouvelle version, ajouter une section `## beta-0.0.<N>` en haut de ce fichier.**

Légende : ✨ Ajouts · 🔧 Modifications · 🐛 Correctifs · 🏗️ Build / technique

---

## beta-0.0.17

**Systèmes du bot, page Données repensée, palette d'émojis** — branche `mobile` · 22 oct. 2026

### ✨ Ajouts
- **Systèmes du bot** (Données → Automatisations → **Systèmes du bot**), exécutés par ton propre bot Fluxer :
  - **Rôles par réaction** : choisis le serveur, le salon, des paires émoji → rôle (émojis Unicode ou du serveur) et le comportement (**ajouter et retirer**, **ajouter seulement**, **un seul rôle**) ; le bot publie le message (ou utilise un message existant, même d'un webhook) et y ajoute les réactions.
  - **Message de bienvenue** et **message de départ** avec les variables `{user}`, `{username}`, `{server}` ; un seul appareil lié les envoie.
  - Connexion du bot (token vérifié, stocké chiffré), état en direct, démarrage / arrêt, journal d'activité ; sur Android, le service du bot les applique **même app fermée** (notification « bot en ligne »).
  - Les systèmes se synchronisent entre appareils liés, comme les sauvegardes.
- **Menus contextuels** dans Données : **clic droit** (Desktop) ou **appui long** (téléphone) sur un élément, ou bouton **⋯** : Aperçu, Ouvrir dans l'éditeur, Ajouter au brouillon, Renommer, Épingler, Déplacer, Étiquettes, Dupliquer, Convertir, Remplacer par le brouillon, Programmer, Exporter, Sélectionner, Supprimer.
- **Aperçu en info-bulle** : survoler un élément environ 1 s affiche son aperçu complet ; un clic ouvre la fenêtre d'aperçu (Ouvrir, Ajouter au brouillon, Plus).
- **Zones de texte redimensionnables** verticalement, avec une poignée sur le bord droit.
- **Palette d'émojis** (bouton @ des zones de texte) : s'ouvre par défaut sur les émojis, avec catégories, recherche (français / anglais), récents et émojis du serveur.

### 🔧 Modifications
- Données : le panneau de détail de droite est retiré ; la liste prend toute la largeur (cartes sur plusieurs colonnes en grand écran) et sépare **Sauvegardes**, **Mes modèles** et **Modèles intégrés**.
- La carte **Bot Fluxer** de l'éditeur est réactivée (token du bot, envoi direct, statut).
- **Barres de défilement** au style de l'app : fines, arrondies, aux couleurs du thème (Desktop) ; arrondies et discrètes (Android).
- Guides mis à jour (menus contextuels, systèmes du bot) ; nouveaux textes traduits dans les 9 langues.

### 🐛 Correctifs
- **Images d'embed par lien** : le message pouvait arriver totalement vide sur Fluxer quand le site du lien refusait les serveurs de Fluxer (Fluxer n'affiche une image que s'il en connaît les dimensions). Avant l'envoi, l'appareil télécharge maintenant l'image et la joint au message (comme une image importée) ; si le lien est inaccessible, il est envoyé tel quel. Vaut aussi pour les automatisations.
- Menu contextuel ouvert par le bouton ⋯ : plus de scintillement de l'écran en le fermant (toucher en dehors) ; il gardait sa position pendant le fondu au lieu de basculer un instant en panneau du bas assombri.


## beta-0.0.16

**Nouvelle page Données, panneau du profil et Guides** — branche `mobile` · 20 oct. 2026

### ✨ Ajouts
- **Page Données refaite en écran complet** (ouverte en touchant « Éditeur ») : **Grand écran** (tablette, paysage) : barre latérale (Bibliothèque, Dossiers, Étiquettes, Outils), liste et panneau de détail côte à côte. **Téléphone** : onglets Bibliothèque / Automatisations / Transfert, filtres en puces et détail en plein écran.
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
- Paramètres → **À propos** : lien vers le serveur **Fluxer Support** (fluxer.gg/eN5mYfx1).
- Les modèles intégrés s'affichent dans la langue de l'app ; nouveaux textes traduits dans les 9 langues (dont « Mentions autorisées », qui ne l'était pas).

## beta-0.0.15

**Historique d'édition avancé, changement de compte corrigé, transfert des données, connexion d'appareils et synchro en temps réel** — commits `8f34f2b` et suivants · 18–19 oct. 2026

### ✨ Ajouts
- **Historique d'édition** : chaque modification de l'éditeur devient une étape (les frappes consécutives sont regroupées).
- Chaque étape est **libellée précisément** : message, embed, champ, propriété (titre, lien du titre, description, couleur, horodatage, auteur, miniature, image, pied de page, contenu, nom, avatar, fichiers, options, mentions, destination, tags, message à modifier, réponse), webhook, ajout, suppression, réordonnancement.
- **Annuler / Rétablir** depuis une barre flottante dans l'éditeur.
- **Chronologie** et nouvelle page **Historique** : retour à n'importe quelle étape, les **branches** sont conservées (indicateur « autre branche » / « ACTUEL »), bouton « Vider l'historique ».
- **150 étapes persistées** entre deux lancements de l'application.
- **Reprise de l'existant** : les sauvegardes et le brouillon d'avant la mise à jour sont importés dans l'historique (« Point de départ », « Brouillon retrouvé »).
- Traductions de tout l'historique dans les **10 langues**.
- **Écran de chargement lors du changement de compte** : avatar, nom et « Changement de compte… » pendant la transition, puis retour au même endroit du profil qu'avant d'ouvrir le sélecteur.
- **Transfert des comptes** : option « Inclure mes comptes » dans le backup complet. Les tokens des comptes enregistrés (et du bot) sont chiffrés en AES-256-GCM avec un mot de passe (PBKDF2-SHA256) ; à la restauration sur un autre appareil, le mot de passe les replace dans le stockage chiffré.
- Restauration d'un backup avec comptes : boîte de mot de passe, erreur affichée directement en cas de mot de passe incorrect, possibilité de restaurer sans les comptes.
- Nouvelle section **« Transférer vers une autre plateforme »** dans les Paramètres : **Exporter mes données** dans un fichier, puis **Importer des données** dans FluxerHooks sur un autre appareil (Mobile ⇄ Desktop). Brouillon, historique, sauvegardes, modèles, automatisations et paramètres ; les **comptes Fluxer** sont inclus par défaut, chiffrés par un mot de passe (option désactivable).
- **Connexion d'appareils** (Paramètres → **Appareils**) : « Scanner le QR code » affiché par FluxerHooks Desktop, ou « Saisir un code ». Les deux appareils doivent être **connectés au même compte Fluxer** : sinon la liaison est refusée, et la synchro s'arrête si l'un d'eux passe sur un autre compte.
- **Synchro automatique** entre appareils liés dès qu'ils sont sur le **même Wi-Fi** avec l'app ouverte : brouillon, historique, sauvegardes, modèles, automatisations et paramètres. Pour chaque élément, la modification la plus récente gagne ; un modèle ajouté sur un appareil et un autre sur le second sont tous deux gardés, et une suppression se propage.
- Au moment de la liaison, choix des **données de départ** : fusionner, garder celles de cet appareil ou prendre celles de l'autre.
- Liste des **appareils de ton compte** : cet appareil, les appareils liés à FluxerHooks (avec leur état de synchro, possibilité de les délier) et les autres appareils connectés à ton compte Fluxer (type, système, lieu approximatif, dernière activité).
- Aucun serveur ni note personnelle Fluxer : les données passent directement d'un appareil à l'autre, **chiffrées en AES-256-GCM** avec une clé propre à chaque liaison.
- Automatisations : avec des appareils liés, chacune n'est envoyée que par un seul appareil (celui qui l'a exécutée en premier).
- **Synchronisation en temps réel** entre appareils liés : connexion directe permanente (WebSocket chiffrée avec la clé de la liaison) ; les données créées depuis **Données** (bouton « Éditeur » : sauvegardes, modèles, automatisations) et l'**historique** sont envoyés et affichés sur l'autre appareil en moins d'une seconde, sans redémarrer l'app. Le brouillon en cours (éditeur et aperçu) reste propre à chaque appareil.
- Historique fusionné étape par étape : chaque appareil voit les étapes des deux et garde sa propre position pour Annuler / Rétablir ; une étape venue de l'autre appareil se restaure depuis la chronologie.
- Rattrapage automatique à la reconnexion (retour dans l'app, retour du Wi-Fi) ; statut « Connecté en direct » dans Paramètres → Appareils. La connexion se ferme quand l'app passe en arrière-plan et se rouvre à son retour.

### 🔧 Modifications
- `state/editor` : gestion de l'historique intégrée à l'état de l'éditeur ; l'écran d'accueil expose les nouvelles actions.
- README traduit en anglais (commit `ad5f4d3`).
- Les boîtes de confirmation (supprimer, vider, restaurer…) sont traduites dans les 10 langues.
- L'instance Fluxer et l'image de fond restent propres à chaque appareil.

### 🏗️ Build / technique
- Nouveau module `src/state/history.ts` et écran `HistorySheet`.
- Workflow « Rebuild old beta » ajusté.
- Nouvelle couche `src/platform/` (secrets, fichiers) et module `src/link/` (index des données, fusion, chiffrement, liaison, découverte sur le réseau local).
- Pièces jointes envoyées via un formulaire construit à l'envoi ; export / import regroupés dans le composant `DataTransfer`.
- Android : lecteur de QR code (`expo-camera`), adresse IP locale (`expo-network`), trafic local autorisé (`expo-build-properties`) ; le contenu reste chiffré.
- Route Fluxer `GET /v1/auth/sessions` pour la liste des appareils du compte.
- Dépendances : `@noble/ciphers`, `expo-crypto`, `qrcode-generator`.
- CI : builds depuis la branche `mobile` ; la dernière version est publiée sous le tag `mobile-latest`, au nom « FluxerHooks-beta<N> ».

### 🐛 Correctifs
- **Changement de compte impossible après l'ajout d'un deuxième compte** : le profil du nouveau compte était affiché avant que son token soit pris en compte, ce qui enregistrait l'ancien token sous le nouveau compte ; le sélecteur revenait donc toujours au même compte.
- Les comptes ne sont désormais enregistrés qu'à partir d'une réponse du serveur pour leur propre token, et chaque token est vérifié avant de basculer.
- Un compte enregistré avec un mauvais token par une version précédente, ou dont la session a expiré, ouvre directement un **formulaire de reconnexion prérempli** pour ce compte (au lieu d'un simple message d'erreur) ; après connexion, l'app bascule automatiquement dessus.
- Une coupure réseau pendant le changement de compte n'est plus prise pour une session invalide : la bascule se fait avec le profil enregistré.
- Déconnexion avec bascule vers le compte suivant : même correction de l'ordre token / profil.
- **Appareils** : seules les sessions du compte actives depuis la création de FluxerHooks (16 oct. 2026) sont affichées ; chaque appareil n'apparaît qu'une fois (les reconnexions du même appareil sont regroupées) ; cet appareil et les appareils liés sont reconnus par leur session Fluxer, sans doublon ni appareil d'exemple.

---
- Les données reçues d'un appareil lié ne s'affichaient qu'après avoir vidé le cache ou forcé l'arrêt de l'app : sauvegardes, modèles, automatisations, historique et paramètres se mettent maintenant à jour à l'écran, sans fermer l'écran ouvert.
- Une modification faite juste après en avoir reçu une pouvait être ignorée.


## beta-0.0.14

**Connexion par e-mail uniquement, CAPTCHA manuel, vrais logos, anglais par défaut** (ex-v1.4.2) — commits `a6e6756`, `8166c4c`, `dac293e`, `914ce33`, `ad5f4d3` · 17 oct. 2026

### ✨ Ajouts
- **Logos officiels** des services dans les connexions du profil : SVG Simple Icons (licence CC0) rendus via `react-native-svg`.
- Traductions des textes du CAPTCHA (« Touchez pour vérifier », « Preuve calculée en {s} s · valable 10 min », etc.) dans les 10 langues.
- Message explicite si le compte n'utilise qu'une clé de sécurité (WebAuthn), non prise en charge.
- **Nommage des versions `FluxerHooks-beta<N>`** : affiché dans l'application (accueil, À propos) et dans les noms d'APK (`FluxerHooks-beta<N>-arm64 / -armv7 / -universel.apk`).
- Workflow **« Rebuild old beta »** pour reconstruire les anciennes versions sous ce nom et les publier chacune dans leur release.

### 🔧 Modifications
- **Compte Fluxer : suppression de la connexion par token** — seule la connexion par e-mail reste.
- **CAPTCHA ALTCHA** : il ne se lance plus qu'au toucher de la case ; « Se connecter » reste grisé tant que la case n'est pas validée, plus aucune vérification automatique.
- **Langue par défaut : anglais** (le choix explicite de l'utilisateur est conservé).

- Messages de connexion clarifiés : champ « Domaine », vérification expirée, réponse inattendue du serveur.

### 🐛 Correctifs
- Reconstruction des anciennes versions : le tag est désormais posé sur le commit courant (la création d'un tag sur un ancien commit était refusée).

### 🏗️ Build / technique
- Nouveau composant `BrandIcon` et données `brandIcons.json`.
- Ajout d'un journal de publication en cas d'échec du workflow de reconstruction.

---

## beta-0.0.13

**Hero centré, marge après l'engrenage, éditeur qui garde sa position** (ex-v1.4.1) — commit `a5dafce` · 17 oct. 2026

### ✨ Ajouts
- **L'éditeur reste monté** : texte, curseur, sections ouvertes et position de défilement sont conservés lors des allers-retours éditeur ↔ aperçu ↔ accueil, et restaurés après un redémarrage (nouveau `uiMemory`).

### 🔧 Modifications
- **Accueil** : bannière centrée horizontalement (colonne centrée, largeur mesurée).
- **Éditeur** : espace ajouté entre l'engrenage et le bouton « Envoyer ».
- Animation de transition lancée après l'affichage de la page.

---

## beta-0.0.12

**Multi-comptes, profil réorganisé** (ex-v1.4.0) — commit `a3ed518` · 17 oct. 2026

### ✨ Ajouts
- **Multi-comptes Fluxer** : ajouter un compte, changer de compte (changement instantané), revenir au compte actuel, retirer un compte de la liste. Les tokens restent chiffrés sur le téléphone ; indication « Connecté en tant que … » et « Ce compte doit être reconnecté ».
- **Aperçu** : badge **BOT** et affichage des **embeds vides**.
- Mention « Bientôt disponible » pour les fonctions à venir.

### 🔧 Modifications
- **Profil réorganisé**.
- **Emojis centrés** dans l'interface.
- **Bot grisé** lorsqu'il n'est pas disponible.
- Menu **Données** déplacé sur le titre.
- Sections **Contenu** et **Embeds** pliables.
- Traductions complétées dans les 10 langues.

---

## beta-0.0.11

**Langues, infobulles, plein écran** (ex-v1.3.0) — commit `59fc5d1` · 17 oct. 2026

### ✨ Ajouts
- **10 langues** : français, anglais, allemand, espagnol, italien, japonais, néerlandais, polonais, portugais, russe, avec sélecteur de langue.
- **Infobulles** sur les boutons et champs.
- **Profil avec raccourcis**.
- Mode **plein écran**.
- **Indicateur d'envoi éphémère**.

### 🔧 Modifications
- **Accueil centré**.
- Interface (`ui`, éditeur de message, aperçu, cibles) adaptée au système de traduction.

---

## beta-0.0.10

**Page d'accueil animée, aperçu flottant** (ex-v1.2.0) — commit `937a5d1` · 16 oct. 2026

### ✨ Ajouts
- **Page d'accueil animée** (`LandingPage`).
- **Bouton Retour**.
- **Aperçu flottant**.
- **Fiche des emojis** (`EmojiInfo`, noms des emojis).
- **Badges en icônes** (badge Plutonium officiel).

### 🔧 Modifications
- Bouton **Envoyer** déplacé dans l'en-tête.
- **Conteneurs repliés** par défaut.
- Rendu Markdown et écran de compte ajustés.

---

## beta-0.0.9

**Démarrage du bot, serveurs administrés** (ex-v1.1.7) — commits `afa62b4`, `123ea4e` · 16 oct. 2026

### ✨ Ajouts
- **Démarrage du bot** depuis l'application : connexion au gateway Fluxer, **service Android au premier plan** et affichage du **statut**.
- **Serveurs administrés** et **webhooks du serveur / du salon** dans le navigateur du bot.
- Nouveau module natif `bot-gateway` (Kotlin) et sonde de protocole du gateway (CI).

### 🐛 Correctifs
- Types de retour Kotlin corrigés dans le module `bot-gateway` (`123ea4e`).

---

## beta-0.0.8

**« Styles personnalisés (CSS) » sous « Thème et couleur »** (ex-v1.1.6) — commits `3b78b6f`, `05e56bb`, `aa50e7e` · 16 oct. 2026

### 🔧 Modifications
- Le réglage **« Styles personnalisés (CSS) »** est placé sous **« Thème et couleur »** dans les paramètres.

### 🏗️ Build / technique
- Ajout du script `enable-abi-splits.js` et ajustement de la CI pour le découpage **APK par architecture**.
- Sondes CI du protocole du gateway Fluxer (ACK, etc.).

---

## beta-0.0.7

**Envoi direct par le bot, éditeur de thème façon Fluxer** (ex-v1.1.5) — commits `d7b0055`, `8bb6e0f` · 16 oct. 2026

### ✨ Ajouts
- **Envoi direct par le bot** : salons, threads et **posts de forum**.
- **Éditeur de thème façon Fluxer** (réécriture de l'éditeur CSS, moteur `theme/css`).
- Destinations du bot disponibles dans l'éditeur (`useBotDestinations`).

### 🔧 Modifications
- Automatisations et paramètres adaptés à l'envoi par le bot.

### 🏗️ Build / technique
- **APK par architecture** (arm64 environ 2× plus léger) **+ APK universel**.
- Vérification de signature `apksigner` et sommes **SHA-256** (`SHA256SUMS.txt`) publiées avec les APK.

---

## beta-0.0.6

**Profil, markdown de bio, libellés accessibles** (ex-v1.1.4) — commit `afeb3db` · 16 oct. 2026

### ✨ Ajouts
- **Profil** : emojis, **markdown de bio Fluxer**, **sections flexibles**.
- Nouveau composant `CaptchaBox` pour la vérification de connexion.

### 🔧 Modifications
- **Libellés accessibles** sur les contrôles de l'interface.
- Rendu Markdown étendu (`Markdown`).
- Solveur CAPTCHA natif (Kotlin) et client ALTCHA retravaillés.

---

## beta-0.0.5

**Boutons thémés, token du bot à côté des webhooks** (ex-v1.1.3) — commits `af27259`, `9405d17` · 16 oct. 2026

### ✨ Ajouts
- **Token du bot** placé à côté des webhooks dans l'éditeur de destinations.

### 🔧 Modifications
- **Boutons de champ thémés**.
- **Icônes d'import modernes**.
- **Bot Fluxer en conteneur unique**.
- **CAPTCHA ALTCHA moderne, pré-calculé**.
- Solveur SHA-256 optimisé.

---

## beta-0.0.4

**Images d'embed à leur place, compositeur en modale** (ex-v1.1.2) — commit `0b126ac` · 16 oct. 2026

### 🔧 Modifications
- **Images d'embed** replacées à leur emplacement correct.
- **Un seul accès** au sélecteur de couleur.
- **Compositeur** affiché dans une **modale floutée**.

---

## beta-0.0.3

**Correction du chargement infini à la connexion** (ex-v1.1.1) — commit `d148c0e` · 16 oct. 2026

### 🐛 Correctifs
- **Chargement infini à la connexion Fluxer** corrigé.

---

## beta-0.0.2

**Compte Fluxer, menus de salons, sélecteur de couleur…** (ex-v1.1.0) — commits `048cbd5`, `d07e126`, `df3db56`, `d4052b0`, `119a97f` · 16 oct. 2026

### ✨ Ajouts
- **Compte Fluxer** : connexion et session persistante.
- **Menus de salons** (liste déroulante de salons).
- **Sélecteur de couleur** complet.
- **Images** : import via une feuille dédiée.
- **Mentions** : compositeur avec mentions.
- **Modèles** de messages.
- **Automatisations**.
- **Personnalisation avancée** : éditeur de styles CSS personnalisés.
- **Centre de données** : sauvegarde complète et import/export.
- **Connexion** : solveur CAPTCHA natif multi-cœurs, délais réseau, progression.

### 🐛 Correctifs
- Encodage base64 séparé du solveur (`119a97f`).

### 🏗️ Build / technique
- Sonde de bout en bout de la connexion Fluxer et journal de sonde en CI.

---

## beta-0.0.1

**Première version** (ex-v1.0.0) — commits `d196337`, `67c99aa`, `549a240`, `afb8085`, `6588060` · 16 oct. 2026

### ✨ Ajouts
- Application Android (React Native + Expo) pour composer et envoyer des messages webhook sur **Fluxer**.
- **Messages multiples** : ajout, duplication, réordonnancement, repli ; envoi d'un message ou de tous.
- **Plusieurs webhooks** vérifiés automatiquement (nom, avatar, salon).
- **Embeds** (jusqu'à 10 par message) : auteur, titre + lien, description markdown, couleur, 25 champs, image, miniature, pied de page, horodatage, compteurs de caractères.
- **Threads et forums**, **édition / suppression** de messages déjà envoyés.
- **Fichiers** (jusqu'à 10) avec spoiler et texte alternatif.
- **Aperçu** façon Fluxer avec Markdown complet.
- **Compte bot** optionnel : serveurs, salons, threads, posts de forum, tags, création de webhooks (token chiffré).
- **Sauvegardes** locales et **import / export JSON** (compatible Discohook).
- **Paramètres** : 6 thèmes, couleur d'accent, taille du texte, arrondis, densité, aperçu compact, écran partagé tablette, confirmation d'envoi, vibrations, instance auto-hébergée.

### 🏗️ Build / technique
- Workflow GitHub Actions « Build Android APK » (SDK préinstallé), pré-release « latest » et journal d'échec.
- Alignement d'`expo-font` et `vector-icons` sur Expo SDK 54.
