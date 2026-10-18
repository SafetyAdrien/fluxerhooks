# FluxerHooks

Android app (React Native + Expo) for composing and sending webhook messages on **Fluxer**: the mobile equivalent of Discohook, adapted to the Fluxer API.

## Features

- **Multiple messages**: add, duplicate, reorder, collapse/expand; send one message or all of them at once.
- **Several webhooks** at the same time, checked automatically (name, avatar, channel).
- **Embeds** (up to 10 per message): author, title + link, markdown description, color (palette + hex), 25 inline or non-inline fields, image, thumbnail, footer, timestamp. Character counters match Fluxer's limits.
- **Threads & forums**: send into an existing thread (`thread_id`), create a **forum post** (`thread_name`) with its **tags** (`applied_tags`).
- **Edit / delete** a message that was already sent (link or ID), loading its content into the editor.
- **Files** (up to 10) with spoiler, alt text and `attachment://` references for embed images.
- Options: hide embeds, silent message, allowed mentions, reply to a message, per-message username and avatar.
- **Fluxer-style preview** (full markdown: bold, italic, underline, strikethrough, code, code blocks, spoilers, links, headings, subtext, quotes, lists, mentions, `<t:…>`).
- **Bot account (optional)**: lists your servers, channels, active threads, forum posts and tags; creates webhooks. Token stored encrypted (Android Keystore).
- Local **saves** and **JSON import/export** (compatible with Discohook's share format and raw payloads).
- **Fluxer account**: sign in with email and password (ALTCHA CAPTCHA solved on the phone, TOTP two-factor authentication); full profile through the profile icon.
- **Dropdown menus** server → channel, grouped by category with an icon for each channel type (text, announcements, voice, forum, media, threads), for both the account and the bot.
- **Modern color picker** (spectrum, hue, palettes, shades, recent colors, hex and RGB).
- **Image import** with editing: ±90° rotation, horizontal/vertical flip, resizing, format and quality.
- **Composer** on every text field: full markdown toolbar and insertion of #channels, @roles, @members, server emojis, `<t:…>` timestamps and navigation links.
- **Data**: saves, templates (8 built-in + your own), automations (once, interval, daily, weekly, with variables) and an exportable full backup.
- **Settings** (gear icon): remembered interface zoom, dimmed wallpaper (DIM, blur, opacity), message appearance (avatars, sizes, bubbles, spacing, embeds), CSS-style style editor by category: 6 themes (Dark, Light, AMOLED, Indigo, Midnight, System), accent color, text size, container rounding, density, compact preview, split screen on tablet/landscape, send confirmation, vibrations, self-hosted instance.

## Android compatibility

Android **7.0 (API 24) and later**, which covers nearly every device in use. This is the minimum required by React Native 0.81 / Expo SDK 54; no recent React Native version goes lower. Universal APK (armeabi-v7a, arm64-v8a, x86, x86_64).

## Getting the APK

### GitHub Actions (automatic)
1. Push this folder to a GitHub repository.
2. Every push to `main` runs **Build Android APK**; the APK is in the run's *Artifacts*.
3. A `v1.0.0` tag also creates a *Release* with the APK attached.

Without any configuration, the APK is signed with the debug key (installable directly). For the Play Store, add these repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

### Locally
```bash
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```
Or with EAS: `npx eas build -p android --profile preview`.

### Development
```bash
npm install
npx expo start      # then "a" for Android, or scan the QR code with Expo Go
npm run web         # quick preview in the browser
```

## Notes on the Fluxer API

- API URLs are discovered through `GET {instance}/.well-known/fluxer` (`endpoints.api_public`), as recommended by the documentation.
- Sending: `POST /v1/webhooks/{id}/{token}?wait=true[&thread_id=…]`, multipart `payload_json` + `files[n]` when there are files.
- Editing / deleting: `PATCH` / `DELETE /v1/webhooks/{id}/{token}/messages/{message_id}`.
- Fluxer does not offer **buttons or components** in messages, so they are not in the editor.
- Avatar and server icon URLs are built on a best-effort basis from the media server; if that fails, the app shows the initial.

## Structure

```
App.tsx                    providers (settings, draft, toasts)
src/api/fluxer.ts          Fluxer HTTP client (webhooks + bot)
src/state/                 settings/themes, persistent draft, sending
src/components/            flexible UI (Box, Grid, Stack…), editors, preview, markdown
src/screens/               home, settings, bot browser, JSON, saves
.github/workflows/         automatic APK build
```

Independent project, not affiliated with Fluxer.
