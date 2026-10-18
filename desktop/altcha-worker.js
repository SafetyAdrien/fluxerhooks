// Fil de calcul du CAPTCHA ALTCHA v2 : PBKDF2(nonce ‖ uint32_be(compteur), sel, coût, longueur)
// jusqu'à ce que la clé (hex) commence par keyPrefix. Les compteurs sont partagés entre les fils.
const { parentPort, workerData } = require('node:worker_threads');
const crypto = require('node:crypto');

const { shared, digest, cost, keyLength, keyPrefix, hintLo, hintHi } = workerData;
const state = new BigInt64Array(shared);
const nonce = Buffer.from(workerData.nonce, 'hex');
const salt = Buffer.from(workerData.salt, 'hex');
const pwd = Buffer.alloc(nonce.length + 4);
nonce.copy(pwd, 0);
const span = hintHi - hintLo + 1;
// Même ordre que l'app Android : la plage probable [hintLo, hintHi] d'abord, puis le début, puis la suite.
const counterAt = (i) => (i < span ? hintLo + i : i < span + hintLo ? i - span : i);

for (;;) {
  const i = Number(Atomics.add(state, 0, 1n));
  if (i > 0xffffffff) break;
  const counter = counterAt(i);
  pwd.writeUInt32BE(counter >>> 0, nonce.length);
  const hex = crypto.pbkdf2Sync(pwd, salt, cost, keyLength, digest).toString('hex');
  Atomics.add(state, 1, 1n);
  if (hex.startsWith(keyPrefix)) {
    parentPort.postMessage({ counter, derivedKey: hex });
    break;
  }
}
