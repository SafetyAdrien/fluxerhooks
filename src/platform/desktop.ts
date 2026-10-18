/**
 * Pont vers l'application de bureau (Electron, AppImage Linux).
 * Exposé par desktop/preload.js sous `window.fluxerDesktop` ; null sur Android et dans un navigateur.
 */
export interface DesktopAltchaOptions {
  algorithm: string;
  nonce: string;
  salt: string;
  cost: number;
  keyLength: number;
  keyPrefix: string;
  timeoutMs: number;
  hintLo?: number;
  hintHi?: number;
}

export interface DesktopBridge {
  platform: string;
  /** Version Desktop (« beta1 »), numérotée séparément de l'app Mobile. */
  version: string;
  /** Stockage chiffré (trousseau du système via safeStorage), équivalent du Keystore Android. */
  secret: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    del(key: string): Promise<void>;
  };
  files: {
    /** Boîte de dialogue « Enregistrer sous » ; renvoie le chemin choisi, ou null si annulé. */
    save(defaultName: string, text: string): Promise<string | null>;
    /** Copie un fichier dans les données de l'app ; renvoie une URL app:// durable. */
    store(name: string, data: ArrayBuffer): Promise<string>;
    /** Supprime un fichier copié par `store`. */
    remove(url: string): Promise<void>;
  };
  altcha: {
    solve(opts: DesktopAltchaOptions): Promise<{ counter: number; derivedKey: string; tries: number }>;
    cancel(): Promise<void>;
    onProgress(cb: (e: { tries: number }) => void): () => void;
  };
  /** Garde l'app dans la zone de notification à la fermeture (automatisations en arrière-plan). */
  setBackground(enabled: boolean): Promise<void>;
}

export const desktop: DesktopBridge | null =
  typeof window !== 'undefined' && (window as any).fluxerDesktop ? ((window as any).fluxerDesktop as DesktopBridge) : null;

export const isDesktop = !!desktop;
