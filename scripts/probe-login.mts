// Vérifie de bout en bout le parcours CAPTCHA de l'app (identifiants factices) :
// 1) défi demandé à l'avance avec un corps vide, 2) résolution dans l'ordre intelligent de l'app,
// 3) connexion avec le jeton pré-calculé → Fluxer doit répondre « identifiants invalides » (CAPTCHA accepté).
import { writeFileSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';

const API = 'https://api.fluxer.app/v1';
const log: string[] = [];
const post = async (json: unknown, captcha?: string) => {
  const t = Date.now();
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(captcha ? { 'X-Captcha-Token': captcha } : {}) },
    body: JSON.stringify(json),
  });
  const j = await r.json().catch(() => null);
  log.push(`HTTP ${r.status} ${j?.code} en ${Date.now() - t} ms`);
  return j;
};
const { base64Utf8 } = await import('../src/utils/base64.ts');
const HINT_LO = 500, HINT_HI = 1000;
const counterAt = (i: number) => (i < HINT_HI - HINT_LO + 1 ? HINT_LO + i : i < HINT_HI + 1 ? i - (HINT_HI - HINT_LO + 1) : i);

const solve = (ch: any) => {
  const p = ch.parameters;
  const nonce = Buffer.from(p.nonce, 'hex'), salt = Buffer.from(p.salt, 'hex');
  const t0 = Date.now();
  for (let i = 0; i < 2_000_000; i++) {
    const counter = counterAt(i);
    const pwd = Buffer.alloc(nonce.length + 4);
    nonce.copy(pwd, 0);
    pwd.writeUInt32BE(counter, nonce.length);
    const key = pbkdf2Sync(pwd, salt, p.cost, p.keyLength ?? 32, 'sha256').toString('hex');
    if (key.startsWith(p.keyPrefix)) {
      log.push(`compteur ${counter} trouvé en ${i + 1} essais (${Date.now() - t0} ms, cost ${p.cost})`);
      return base64Utf8(JSON.stringify({ challenge: { parameters: ch.parameters, signature: ch.signature }, solution: { counter, derivedKey: key, time: Date.now() - t0 } }));
    }
  }
  throw new Error('insoluble');
};

const pre = await post({});
log.push('défi par corps vide : ' + (pre?.altcha_challenge ? 'OK' : 'ABSENT ' + JSON.stringify(pre).slice(0, 300)));
if (pre?.altcha_challenge) {
  const token = solve(pre.altcha_challenge);
  const r = await post({ email: 'probe-fluxerhooks@example.com', password: 'invalid-password-123' }, token);
  log.push('connexion avec jeton pré-calculé : ' + JSON.stringify(r).slice(0, 300));
  const replay = await post({ email: 'probe-fluxerhooks@example.com', password: 'invalid-password-123' }, token);
  log.push('rejeu du même jeton : ' + replay?.code + (replay?.altcha_challenge ? ' (+ nouveau défi)' : ''));
}
writeFileSync('out/probe.txt', log.join('\n'));
console.log(log.join('\n'));
