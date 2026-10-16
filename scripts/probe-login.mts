// Vérifie de bout en bout la connexion Fluxer (identifiants factices) : CAPTCHA résolu par le code de l'app.
import { writeFileSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';

const API = 'https://api.fluxer.app/v1';
const body = JSON.stringify({ email: 'probe-fluxerhooks@example.com', password: 'invalid-password-123' });
const log: string[] = [];
const post = async (captcha?: string) => {
  const t = Date.now();
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(captcha ? { 'X-Captcha-Token': captcha } : {}) }, body });
  const j = await r.json().catch(() => null);
  log.push(`HTTP ${r.status} ${j?.code} en ${Date.now() - t} ms`);
  return j;
};

// Même construction de jeton que src/api/altcha.ts, avec PBKDF2 natif de Node pour la vitesse.
const { base64Utf8 } = await import('../src/api/altcha.ts');
const first = await post();
const ch = first?.altcha_challenge;
if (!ch) throw new Error('pas de défi : ' + JSON.stringify(first));
const p = ch.parameters;
const nonce = Buffer.from(p.nonce, 'hex');
const salt = Buffer.from(p.salt, 'hex');
const t0 = Date.now();
let counter = 0;
let key = '';
for (; counter < 2_000_000; counter++) {
  const pwd = Buffer.alloc(nonce.length + 4);
  nonce.copy(pwd, 0);
  pwd.writeUInt32BE(counter, nonce.length);
  key = pbkdf2Sync(pwd, salt, p.cost, p.keyLength ?? 32, 'sha256').toString('hex');
  if (key.startsWith(p.keyPrefix)) break;
}
log.push(`compteur trouvé : ${counter} en ${Date.now() - t0} ms (cost ${p.cost})`);
const token = base64Utf8(JSON.stringify({ challenge: { parameters: ch.parameters, signature: ch.signature }, solution: { counter, derivedKey: key, time: Date.now() - t0 } }));
const second = await post(token);
log.push('réponse finale : ' + JSON.stringify(second).slice(0, 400));
// Deuxième défi pour mesurer la plage des compteurs
for (let i = 0; i < 3; i++) {
  const j = await post();
  const q = j?.altcha_challenge?.parameters;
  if (!q) continue;
  const n = Buffer.from(q.nonce, 'hex'), s = Buffer.from(q.salt, 'hex');
  let c = 0;
  for (; c < 2_000_000; c++) {
    const pw = Buffer.alloc(n.length + 4); n.copy(pw, 0); pw.writeUInt32BE(c, n.length);
    if (pbkdf2Sync(pw, s, q.cost, q.keyLength ?? 32, 'sha256').toString('hex').startsWith(q.keyPrefix)) break;
  }
  log.push(`défi ${i + 2} : compteur ${c}`);
}
writeFileSync('out/probe.txt', log.join('\n'));
console.log(log.join('\n'));
