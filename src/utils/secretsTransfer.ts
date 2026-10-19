import AsyncStorage from '@react-native-async-storage/async-storage';
import { gcm } from '@noble/ciphers/aes';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from '../platform/secureStore';

/**
 * Transfert des comptes entre appareils (Android ⇄ Linux) : les tokens, normalement gardés dans le
 * stockage chiffré de l'appareil, sont ajoutés au backup chiffrés en AES-256-GCM avec une clé dérivée
 * du mot de passe choisi (PBKDF2-SHA256). Sans le mot de passe, le fichier ne révèle aucun token.
 */

export interface SealedSecrets {
  v: 1;
  kdf: 'pbkdf2-sha256';
  iter: number;
  salt: string;
  iv: string;
  data: string;
}

const ACCOUNTS_KEY = 'fluxerhooks:accounts:v1';
const FIXED_KEYS = ['fluxerhooks_user_token', 'fluxerhooks_bot_token'];
const ITERATIONS = 120_000;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}
function fromB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
// UTF-8 sans TextEncoder/TextDecoder (pas toujours présents sous Hermes).
function utf8(str: string): Uint8Array {
  const out: number[] = [];
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}
function bytesToUtf8(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const x = b[i++];
    let c = x;
    if (x >= 0xf0) c = ((x & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (x >= 0xe0) c = ((x & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (x >= 0xc0) c = ((x & 31) << 6) | (b[i++] & 63);
    s += String.fromCodePoint(c);
  }
  return s;
}

const deriveKey = (password: string, salt: Uint8Array, iter: number) => pbkdf2Async(sha256, utf8(password), salt, { c: iter, dkLen: 32 });

/** Clés des secrets à transférer : session active, bot, et token de chaque compte enregistré. */
async function secretKeys(): Promise<string[]> {
  let ids: string[] = [];
  try {
    ids = (JSON.parse((await AsyncStorage.getItem(ACCOUNTS_KEY)) ?? '[]') as { id: string }[]).map((a) => a.id);
  } catch {
    ids = [];
  }
  return [...FIXED_KEYS, ...ids.map((id) => `fluxerhooks_acct_${id}`)];
}

/** Nombre de comptes dont le token peut être transféré. */
export async function countTransferableAccounts(): Promise<number> {
  let n = 0;
  for (const k of await secretKeys()) if (k.startsWith('fluxerhooks_acct_') && (await SecureStore.getItemAsync(k).catch(() => null))) n++;
  return n;
}

export async function sealSecrets(password: string): Promise<SealedSecrets> {
  const values: Record<string, string> = {};
  for (const k of await secretKeys()) {
    const v = await SecureStore.getItemAsync(k).catch(() => null);
    if (v) values[k] = v;
  }
  const salt = getRandomBytes(16);
  const iv = getRandomBytes(12);
  const key = await deriveKey(password, salt, ITERATIONS);
  const data = gcm(key, iv).encrypt(utf8(JSON.stringify(values)));
  return { v: 1, kdf: 'pbkdf2-sha256', iter: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}

export class WrongPasswordError extends Error {}

/** Déchiffre et enregistre les tokens dans le stockage chiffré de cet appareil ; renvoie leur nombre. */
export async function restoreSecrets(sealed: SealedSecrets, password: string): Promise<number> {
  if (sealed?.v !== 1 || sealed.kdf !== 'pbkdf2-sha256') throw new Error('Format de comptes chiffrés inconnu.');
  const key = await deriveKey(password, fromB64(sealed.salt), sealed.iter);
  let plain: Uint8Array;
  try {
    plain = gcm(key, fromB64(sealed.iv)).decrypt(fromB64(sealed.data));
  } catch {
    throw new WrongPasswordError('Mot de passe incorrect.');
  }
  const values = JSON.parse(bytesToUtf8(plain)) as Record<string, string>;
  const entries = Object.entries(values).filter(([k, v]) => k.startsWith('fluxerhooks_') && typeof v === 'string' && v);
  for (const [k, v] of entries) await SecureStore.setItemAsync(k, v);
  return entries.filter(([k]) => k.startsWith('fluxerhooks_acct_')).length;
}
