# FluxerHooks

Application Android (React Native + Expo) pour composer et envoyer des messages webhook sur **Fluxer** — l’équivalent mobile de Discohook, adapté à l’API Fluxer.

## Fonctionnalités

- **Messages multiples** : ajoute, duplique, réordonne, replie/déplie ; envoi d’un message ou de tous d’un coup.
- **Plusieurs webhooks** en même temps, vérifiés automatiquement (nom, avatar, salon).
- **Embeds** (jusqu’à 10 par message) : auteur, titre + lien, description markdown, couleur (palette + hex), 25 champs en ligne ou non, image, miniature, pied de page, horodatage. Compteurs de caractères calés sur les limites Fluxer.
- **Threads & forums** : envoyer dans un thread existant (`thread_id`), créer un **post de forum** (`thread_name`) avec ses **tags** (`applied_tags`).
- **Édition / suppression** d’un message déjà envoyé (lien ou ID), chargement de son contenu dans l’éditeur.
- **Fichiers** (jusqu’à 10) avec spoiler, texte alternatif et référence `attachment://` pour les images d’embed.
- Options : masquer les embeds, message silencieux, mentions autorisées, réponse à un message, pseudo et avatar par message.
- **Aperçu** façon Fluxer (markdown complet : gras, italique, souligné, barré, code, blocs, spoilers, liens, titres, sous-texte, citations, listes, mentions, `<t:…>`).
- **Compte bot (optionnel)** : liste tes serveurs, salons, threads actifs, posts de forum et tags ; crée des webhooks. Token stocké chiffré (Android Keystore).
- **Sauvegardes** locales et **import/export JSON** (compatible avec le format de partage Discohook et les payloads bruts).
- **Compte Fluxer** : connexion par e-mail et mot de passe (CAPTCHA ALTCHA résolu sur le téléphone, double authentification TOTP) ou par token ; profil complet via l’icône de profil.
- **Menus déroulants** serveur → salon, rangés par catégorie avec les icônes de chaque type de salon (texte, annonces, vocal, forum, média, threads), pour le compte comme pour le bot.
- **Sélecteur de couleur moderne** (spectre, teinte, palettes, nuances, couleurs récentes, hex et RVB).
- **Import d’images** avec retouche : rotation ±90°, miroir horizontal/vertical, redimensionnement, format et qualité.
- **Compositeur** sur tous les champs texte : barre markdown complète et insertion de #salons, @rôles, @membres, émojis du serveur, horodatages `<t:…>` et liens de navigation.
- **Données** : sauvegardes, modèles (8 intégrés + les tiens), automatisations (une fois, intervalle, quotidien, hebdomadaire, avec variables) et backup complet exportable.
- **Paramètres** (icône engrenage) : zoom de l’interface mémorisé, fond d’écran assombri (DIM, flou, opacité), apparence des messages (avatars, tailles, bulles, espacement, embeds), éditeur de styles façon CSS par catégorie : 6 thèmes (Sombre, Clair, AMOLED, Indigo, Minuit, Système), couleur d’accent, taille du texte, arrondi des conteneurs, densité, aperçu compact, écran partagé tablette/paysage, confirmation d’envoi, vibrations, instance auto-hébergée.

## Compatibilité Android

Android **7.0 (API 24) et plus**, soit la quasi-totalité des appareils en service. C’est le minimum imposé par React Native 0.81 / Expo SDK 54 ; aucune version récente de React Native ne descend plus bas. APK universel (armeabi-v7a, arm64-v8a, x86, x86_64).

## Obtenir l’APK

### GitHub Actions (automatique)
1. Pousse ce dossier dans un dépôt GitHub.
2. Chaque push sur `main` lance **Build Android APK** ; l’APK est dans les *Artifacts* du run.
3. Un tag `v1.0.0` crée aussi une *Release* avec l’APK attaché.

Sans configuration, l’APK est signé avec la clé de debug (installable directement). Pour le Play Store, ajoute ces secrets du dépôt : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

### En local
```bash
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```
Ou avec EAS : `npx eas build -p android --profile preview`.

### Développement
```bash
npm install
npx expo start      # puis « a » pour Android, ou scanne le QR avec Expo Go
npm run web         # aperçu rapide dans le navigateur
```

## Notes sur l’API Fluxer

- Les URL d’API sont découvertes via `GET {instance}/.well-known/fluxer` (`endpoints.api_public`), comme le recommande la documentation.
- Envoi : `POST /v1/webhooks/{id}/{token}?wait=true[&thread_id=…]`, multipart `payload_json` + `files[n]` quand il y a des fichiers.
- Édition / suppression : `PATCH` / `DELETE /v1/webhooks/{id}/{token}/messages/{message_id}`.
- Fluxer ne propose pas de **boutons ni de composants** dans les messages : ils ne sont donc pas dans l’éditeur.
- Les URL d’avatars et d’icônes de serveur sont construites au mieux depuis le serveur média ; en cas d’échec, l’app affiche l’initiale.

## Structure

```
App.tsx                    providers (paramètres, brouillon, toasts)
src/api/fluxer.ts          client HTTP Fluxer (webhooks + bot)
src/state/                 paramètres/thèmes, brouillon persistant, envoi
src/components/            UI flexible (Box, Grid, Stack…), éditeurs, aperçu, markdown
src/screens/               accueil, paramètres, navigateur bot, JSON, sauvegardes
.github/workflows/         build APK automatique
```

Projet indépendant, non affilié à Fluxer.
