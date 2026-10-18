# Journal des modifications (audit log) — FluxerHooks

Historique complet de chaque version publiée : **ajouts**, **modifications** et **correctifs**.
La correspondance est `versionCode N` = `FluxerHooks-beta<N>`. Les numéros « v1.x » sont les anciens noms internes des versions, avant le nommage `beta<N>`.

> Ce fichier est la source des descriptions des releases GitHub : chaque section `## beta<N>` est reprise telle quelle dans la release correspondante (`scripts/release-notes.js`).
> **À chaque nouvelle version, ajouter une section `## beta<N>` en haut de ce fichier.**

Légende : ✨ Ajouts · 🔧 Modifications · 🐛 Correctifs · 🏗️ Build / technique

---

## beta15

**Historique d'édition avancé, changement de compte corrigé** — commits `8f34f2b` et suivants · 18 oct. 2026

### ✨ Ajouts
- **Historique d'édition** : chaque modification de l'éditeur devient une étape (les frappes consécutives sont regroupées).
- Chaque étape est **libellée précisément** : message, embed, champ, propriété (titre, lien du titre, description, couleur, horodatage, auteur, miniature, image, pied de page, contenu, nom, avatar, fichiers, options, mentions, destination, tags, message à modifier, réponse), webhook, ajout, suppression, réordonnancement.
- **Annuler / Rétablir** depuis une barre flottante dans l'éditeur.
- **Chronologie** et nouvelle page **Historique** : retour à n'importe quelle étape, les **branches** sont conservées (indicateur « autre branche » / « ACTUEL »), bouton « Vider l'historique ».
- **150 étapes persistées** entre deux lancements de l'application.
- **Reprise de l'existant** : les sauvegardes et le brouillon d'avant la mise à jour sont importés dans l'historique (« Point de départ », « Brouillon retrouvé »).
- Traductions de tout l'historique dans les **10 langues**.
- **Écran de chargement lors du changement de compte** : avatar, nom et « Changement de compte… » pendant la transition, puis retour au même endroit du profil qu'avant d'ouvrir le sélecteur.

### 🔧 Modifications
- `state/editor` : gestion de l'historique intégrée à l'état de l'éditeur ; l'écran d'accueil expose les nouvelles actions.
- README traduit en anglais (commit `ad5f4d3`).

### 🏗️ Build / technique
- Nouveau module `src/state/history.ts` et écran `HistorySheet`.
- Workflow « Rebuild old beta » ajusté.

### 🐛 Correctifs
- **Changement de compte impossible après l'ajout d'un deuxième compte** : le profil du nouveau compte était affiché avant que son token soit pris en compte, ce qui enregistrait l'ancien token sous le nouveau compte ; le sélecteur revenait donc toujours au même compte.
- Les comptes ne sont désormais enregistrés qu'à partir d'une réponse du serveur pour leur propre token, et chaque token est vérifié avant de basculer.
- Un compte enregistré avec un mauvais token par une version précédente est détecté : son token est oublié et l'app demande de le reconnecter.
- Déconnexion avec bascule vers le compte suivant : même correction de l'ordre token / profil.

---

## beta14

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

## beta13

**Hero centré, marge après l'engrenage, éditeur qui garde sa position** (ex-v1.4.1) — commit `a5dafce` · 17 oct. 2026

### ✨ Ajouts
- **L'éditeur reste monté** : texte, curseur, sections ouvertes et position de défilement sont conservés lors des allers-retours éditeur ↔ aperçu ↔ accueil, et restaurés après un redémarrage (nouveau `uiMemory`).

### 🔧 Modifications
- **Accueil** : bannière centrée horizontalement (colonne centrée, largeur mesurée).
- **Éditeur** : espace ajouté entre l'engrenage et le bouton « Envoyer ».
- Animation de transition lancée après l'affichage de la page.

---

## beta12

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

## beta11

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

## beta10

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

## beta9

**Démarrage du bot, serveurs administrés** (ex-v1.1.7) — commits `afa62b4`, `123ea4e` · 16 oct. 2026

### ✨ Ajouts
- **Démarrage du bot** depuis l'application : connexion au gateway Fluxer, **service Android au premier plan** et affichage du **statut**.
- **Serveurs administrés** et **webhooks du serveur / du salon** dans le navigateur du bot.
- Nouveau module natif `bot-gateway` (Kotlin) et sonde de protocole du gateway (CI).

### 🐛 Correctifs
- Types de retour Kotlin corrigés dans le module `bot-gateway` (`123ea4e`).

---

## beta8

**« Styles personnalisés (CSS) » sous « Thème et couleur »** (ex-v1.1.6) — commits `3b78b6f`, `05e56bb`, `aa50e7e` · 16 oct. 2026

### 🔧 Modifications
- Le réglage **« Styles personnalisés (CSS) »** est placé sous **« Thème et couleur »** dans les paramètres.

### 🏗️ Build / technique
- Ajout du script `enable-abi-splits.js` et ajustement de la CI pour le découpage **APK par architecture**.
- Sondes CI du protocole du gateway Fluxer (ACK, etc.).

---

## beta7

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

## beta6

**Profil, markdown de bio, libellés accessibles** (ex-v1.1.4) — commit `afeb3db` · 16 oct. 2026

### ✨ Ajouts
- **Profil** : emojis, **markdown de bio Fluxer**, **sections flexibles**.
- Nouveau composant `CaptchaBox` pour la vérification de connexion.

### 🔧 Modifications
- **Libellés accessibles** sur les contrôles de l'interface.
- Rendu Markdown étendu (`Markdown`).
- Solveur CAPTCHA natif (Kotlin) et client ALTCHA retravaillés.

---

## beta5

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

## beta4

**Images d'embed à leur place, compositeur en modale** (ex-v1.1.2) — commit `0b126ac` · 16 oct. 2026

### 🔧 Modifications
- **Images d'embed** replacées à leur emplacement correct.
- **Un seul accès** au sélecteur de couleur.
- **Compositeur** affiché dans une **modale floutée**.

---

## beta3

**Correction du chargement infini à la connexion** (ex-v1.1.1) — commit `d148c0e` · 16 oct. 2026

### 🐛 Correctifs
- **Chargement infini à la connexion Fluxer** corrigé.

---

## beta2

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

## beta1

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
