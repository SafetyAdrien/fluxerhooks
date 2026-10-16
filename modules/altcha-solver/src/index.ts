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
  }): Promise<{ counter: number; derivedKey: string; tries: number }>;
  cancel(): Promise<void>;
  addListener(event: 'onProgress', cb: (e: { tries: number }) => void): { remove(): void };
}

/** Module natif Android (null sur le web / Expo Go : repli JavaScript). */
export const AltchaSolver = requireOptionalNativeModule<NativeSolver>('AltchaSolver');
