import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2';
import { AltchaSolver } from '../../modules/altcha-solver/src';
import { base64Utf8 } from '../utils/base64';
export { base64Utf8 };

/**
 * Solveur ALTCHA v2 (preuve de travail PBKDF2) utilisé par Fluxer pour le CAPTCHA de connexion.
 * Algorithme (cf. altcha-lib v2) : pour counter = 0, 1, 2… on dérive
 *   PBKDF2(password = nonce ‖ uint32_be(counter), salt, cost, keyLength)
 * jusqu'à ce que la clé (en hex) commence par keyPrefix.
 */

export interface AltchaChallenge {
  parameters: {
    algorithm: string;
    nonce: string;
    salt: string;
    cost: number;
    keyLength?: number;
    keyPrefix: string;
    [k: string]: unknown;
  };
  signature?: string;
  [k: string]: unknown;
}

const hexToBytes = (hex: string) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};
const bytesToHex = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
};

const HASHES: Record<string, any> = {
  'PBKDF2/SHA-256': sha256,
  'PBKDF2/SHA-384': sha384,
  'PBKDF2/SHA-512': sha512,
};

const tokenOf = (challenge: AltchaChallenge, counter: number, derivedKey: string, time: number) =>
  base64Utf8(
    JSON.stringify({
      challenge: { parameters: challenge.parameters, signature: challenge.signature },
      solution: { counter, derivedKey, time },
    }),
  );

/**
 * Fluxer tire le compteur dans [maxCounter/2, maxCounter] (max_counter = 1000 par défaut) :
 * on commence par cette plage, puis le début, puis la suite (toujours exhaustif).
 */
export const HINT_LO = 500;
export const HINT_HI = 1000;
export function counterAt(i: number): number {
  const span = HINT_HI - HINT_LO + 1;
  if (i < span) return HINT_LO + i;
  if (i < span + HINT_LO) return i - span;
  return i;
}

export const hasNativeSolver = !!AltchaSolver;

export function cancelAltcha() {
  AltchaSolver?.cancel().catch(() => {});
}

/**
 * Résout le défi et renvoie la valeur à mettre dans X-Captcha-Token.
 * Fluxer utilise le mode « déterministe » (compteur choisi par le serveur, souvent plusieurs milliers) :
 * sur Android on calcule en natif sur tous les cœurs, le JavaScript seul serait beaucoup trop lent.
 */
export async function solveAltcha(
  challenge: AltchaChallenge,
  onProgress?: (tries: number) => void,
  timeoutMs = 180_000,
): Promise<string> {
  const p = challenge.parameters;
  if (AltchaSolver) {
    const t0 = Date.now();
    const sub = AltchaSolver.addListener('onProgress', (e) => onProgress?.(e.tries));
    try {
      const r = await AltchaSolver.solve({
        algorithm: p.algorithm,
        nonce: p.nonce,
        salt: p.salt,
        cost: p.cost,
        keyLength: p.keyLength ?? 32,
        keyPrefix: String(p.keyPrefix),
        timeoutMs,
        hintLo: HINT_LO,
        hintHi: HINT_HI,
      });
      return tokenOf(challenge, r.counter, r.derivedKey, Date.now() - t0);
    } finally {
      sub.remove();
    }
  }
  return solveAltchaJs(challenge, onProgress, timeoutMs);
}

/** Repli JavaScript (web, Expo Go). */
export async function solveAltchaJs(
  challenge: AltchaChallenge,
  onProgress?: (tries: number) => void,
  timeoutMs = 120_000,
): Promise<string> {
  const p = challenge.parameters;
  const hash = HASHES[p.algorithm];
  if (!hash) throw new Error(`Algorithme de CAPTCHA non pris en charge : ${p.algorithm}`);
  const nonce = hexToBytes(p.nonce);
  const salt = hexToBytes(p.salt);
  const keyLength = p.keyLength ?? 32;
  const prefix = String(p.keyPrefix).toLowerCase();
  const pwd = new Uint8Array(nonce.length + 4);
  pwd.set(nonce, 0);
  const t0 = Date.now();
  for (let i = 0; i <= 0xffffffff; i++) {
    const counter = counterAt(i);
    pwd[nonce.length] = (counter >>> 24) & 255;
    pwd[nonce.length + 1] = (counter >>> 16) & 255;
    pwd[nonce.length + 2] = (counter >>> 8) & 255;
    pwd[nonce.length + 3] = counter & 255;
    // Calcul synchrone (plus rapide) ; on rend la main à l'interface toutes les 3 tentatives.
    const key: Uint8Array = pbkdf2(hash, pwd, salt, { c: p.cost, dkLen: keyLength });
    if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    const hex = bytesToHex(key);
    if (hex.startsWith(prefix)) {
      return tokenOf(challenge, counter, hex, Date.now() - t0);
    }
    if (i % 4 === 0) onProgress?.(i + 1);
    if (Date.now() - t0 > timeoutMs) throw new Error('Le CAPTCHA a pris trop de temps, réessaie.');
  }
  throw new Error('CAPTCHA insoluble.');
}
