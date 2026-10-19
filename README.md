# FluxerHooks Desktop

Linux version of **FluxerHooks**: compose and send webhook messages on **Fluxer** (embeds, threads, forum posts, multiple messages, automations, themes…), with exactly the same interface and features as the Mobile app.

This branch (`desktop`) contains only FluxerHooks Desktop. The Mobile app lives on the `mobile` branch.

## Download

Get `FluxerHooks-<version>-x86_64.AppImage` from the **desktop-latest** pre-release, make it executable and run it:

```bash
chmod +x FluxerHooks-beta-0.0.3-x86_64.AppImage
./FluxerHooks-beta-0.0.3-x86_64.AppImage
```

AppImages need FUSE 2 (`sudo pacman -S fuse2` on Arch / CachyOS).

## Desktop specifics

- Account tokens are stored encrypted in the system keyring (Electron `safeStorage`).
- The Fluxer login CAPTCHA is solved natively on all CPU cores.
- Automations keep running from the system tray when the window is closed.
- **Devices** (Settings): your account's real devices, and device linking — FluxerHooks Desktop shows a QR code that the Mobile app scans (between two computers, copy/paste the code). Linked devices signed in to the same Fluxer account sync their data automatically on the same Wi-Fi, directly between them (Desktop listens on TCP port **47321**), encrypted with AES-256-GCM. No server is involved.
- **Transfer to another platform** (Settings): export / import all data in a file, Fluxer accounts included (encrypted with a password).

## Versions

FluxerHooks Desktop has its own numbering (`fluxerhooksVersion` in `desktop/package.json`), independent from the Mobile app. Every version is described in [`CHANGELOG.md`](CHANGELOG.md).

## Build locally

```bash
npm install && npm install --prefix desktop
npx expo export --platform web --output-dir desktop/web
cd desktop && FH_VERSION=$(node -p "require('./package.json').fluxerhooksVersion") npx electron-builder --linux AppImage --x64
```

The `Build Linux AppImage` workflow does the same on every push to `desktop` and publishes the **desktop-latest** pre-release.
