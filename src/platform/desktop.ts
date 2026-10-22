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
  /** Version Desktop (« beta-0.0.1 »), numérotée séparément de l'app Mobile. */
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
    /** Télécharge une image (processus principal) et la copie dans les données de l'app. Absent avant beta-0.0.5. */
    download?(url: string, maxBytes: number): Promise<{ uri: string; mimeType: string; size: number } | null>;
  };
  altcha: {
    solve(opts: DesktopAltchaOptions): Promise<{ counter: number; derivedKey: string; tries: number }>;
    cancel(): Promise<void>;
    onProgress(cb: (e: { tries: number }) => void): () => void;
  };
  /** Garde l'app dans la zone de notification à la fermeture (automatisations en arrière-plan). */
  setBackground(enabled: boolean): Promise<void>;
  /** Connexion d'appareils : serveur local et requêtes sur le réseau local. */
  link?: {
    hostname: string;
    localAddresses(): Promise<string[]>;
    request(url: string, method: string, body: string | null, timeoutMs: number): Promise<{ status: number; body: string }>;
    serve(on: boolean): Promise<number | null>;
    port(): Promise<number>;
    onRequest(handler: (req: { method: string; path: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; body: string }>): () => void;
    /** Connexion en direct (WebSocket) relayée par le processus principal. */
    liveConnect?(url: string): Promise<string | null>;
    liveSend?(id: string, data: string): void;
    liveClose?(id: string): void;
    onLive?(cb: (msg: { type: 'open' | 'message' | 'close'; id: string; data?: string; incoming?: boolean }) => void): () => void;
  };
}

export const desktop: DesktopBridge | null =
  typeof window !== 'undefined' && (window as any).fluxerDesktop ? ((window as any).fluxerDesktop as DesktopBridge) : null;

export const isDesktop = !!desktop;
