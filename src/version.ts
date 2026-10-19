import app from '../app.json';

/**
 * Nom de la version affiché dans l'app. Mobile (Android) : « beta-0.0.15 », lu dans app.json.
 * Desktop (Linux) : numérotation propre, fournie par l'app de bureau (desktop/package.json).
 */
const desktopVersion: string | undefined =
  typeof window !== 'undefined' ? (window as any).fluxerDesktop?.version : undefined;
export const APP_VERSION: string = desktopVersion || app.expo.version;
