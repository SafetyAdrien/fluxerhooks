import { requireOptionalNativeModule } from 'expo';

interface NativeSolver {
  solve(opts: {
    algorithm: string;
    nonce: string;
    salt: string;
    cost: number;
    keyLength: number;
    keyPrefix: string;
    timeoutMs: number;
    hintLo?: number;
    hintHi?: number;
  }): Promise<{ counter: number; derivedKey: string; tries: number }>;
  cancel(): Promise<void>;
  addListener(event: 'onProgress', cb: (e: { tries: number }) => void): { remove(): void };
}

/** Solveur du bureau (Electron) : PBKDF2 natif d'OpenSSL réparti sur tous les cœurs. */
function desktopSolver(): NativeSolver | null {
  const d = typeof window !== 'undefined' ? (window as any).fluxerDesktop : null;
  if (!d?.altcha) return null;
  return {
    solve: (opts) => d.altcha.solve(opts),
    cancel: () => d.altcha.cancel(),
    addListener: (_event, cb) => ({ remove: d.altcha.onProgress(cb) }),
  };
}

/** Module natif Android, solveur du bureau, sinon null (web / Expo Go : repli JavaScript). */
export const AltchaSolver = requireOptionalNativeModule<NativeSolver>('AltchaSolver') ?? desktopSolver();
