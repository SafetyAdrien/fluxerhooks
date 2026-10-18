# Journal des modifications (audit log) — FluxerHooks Desktop

Historique de chaque version de **FluxerHooks Desktop** (Linux), numérotée séparément de l'app Mobile : **ajouts**, **modifications** et **correctifs**.

> Ce fichier est la source des descriptions des releases Desktop (`desktop-latest`) : chaque section `## beta<N>` est reprise telle quelle (`scripts/release-notes.js`).
> **À chaque nouvelle version Desktop, ajouter une section `## beta<N>` en haut de ce fichier** et mettre à jour `fluxerhooksVersion` dans `desktop/package.json`.

Légende : ✨ Ajouts · 🔧 Modifications · 🐛 Correctifs · 🏗️ Build / technique

---

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
