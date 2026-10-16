import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2';
import { AltchaSolver } from '../../modules/altcha-solver/src';

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

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function utf8(str: string): number[] {
  const out: number[] = [];
  for (const ch of str) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
export function base64Utf8(str: string): string {
  const b = utf8(str);
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return s;
}

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
  for (let counter = 0; counter <= 0xffffffff; counter++) {
    pwd[nonce.length] = (counter >>> 24) & 255;
    pwd[nonce.length + 1] = (counter >>> 16) & 255;
    pwd[nonce.length + 2] = (counter >>> 8) & 255;
    pwd[nonce.length + 3] = counter & 255;
    // Calcul synchrone (plus rapide) ; on rend la main à l'interface toutes les 3 tentatives.
    const key: Uint8Array = pbkdf2(hash, pwd, salt, { c: p.cost, dkLen: keyLength });
    if (counter % 3 === 2) await new Promise((r) => setTimeout(r, 0));
    const hex = bytesToHex(key);
    if (hex.startsWith(prefix)) {
      return tokenOf(challenge, counter, hex, Date.now() - t0);
    }
    if (counter % 4 === 0) onProgress?.(counter + 1);
    if (Date.now() - t0 > timeoutMs) throw new Error('Le CAPTCHA a pris trop de temps, réessaie.');
  }
  throw new Error('CAPTCHA insoluble.');
}
