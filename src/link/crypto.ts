import { gcm } from '@noble/ciphers/aes';
import { getRandomBytes } from 'expo-crypto';

/** Chiffrement des échanges entre appareils liés : AES-256-GCM, données liées à la route (AAD). */

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function toB64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bytes.length ? A[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? A[n & 63] : '');
  }
  return out;
}
export function fromB64url(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9_-]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c = [0, 1, 2, 3].map((j) => (i + j < clean.length ? A.indexOf(clean[i + j]) : 0));
    const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// UTF-8 sans TextEncoder/TextDecoder (pas toujours présents sous Hermes).
export function utf8(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}
export function fromUtf8(b: Uint8Array): string {
  const parts: string[] = [];
  let chunk: number[] = [];
  for (let i = 0; i < b.length; ) {
    const x = b[i++];
    let c = x;
    if (x >= 0xf0) c = ((x & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (x >= 0xe0) c = ((x & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else if (x >= 0xc0) c = ((x & 31) << 6) | (b[i++] & 63);
    if (c >= 0x10000) {
      c -= 0x10000;
      chunk.push(0xd800 + (c >> 10), 0xdc00 + (c & 1023));
    } else chunk.push(c);
    if (chunk.length > 8000) {
      parts.push(String.fromCharCode(...chunk));
      chunk = [];
    }
  }
  parts.push(String.fromCharCode(...chunk));
  return parts.join('');
}

export const randomKey = () => getRandomBytes(32);

/** Chiffre un objet JSON ; `aad` lie le message à son usage (une route), pour qu'il ne puisse pas être rejoué ailleurs. */
export function seal(key: Uint8Array, obj: unknown, aad: string): string {
  const iv = getRandomBytes(12);
  const data = gcm(key, iv, utf8(aad)).encrypt(utf8(JSON.stringify(obj)));
  return `${toB64url(iv)}.${toB64url(data)}`;
}

/** Déchiffre un message de `seal` ; lève une erreur si la clé ou l'usage ne correspondent pas. */
export function open<T = any>(key: Uint8Array, text: string, aad: string): T {
  const [iv, data] = String(text).split('.');
  if (!iv || !data) throw new Error('bad message');
  return JSON.parse(fromUtf8(gcm(key, fromB64url(iv), utf8(aad)).decrypt(fromB64url(data)))) as T;
}
