// Vérifie le protocole du gateway Fluxer : découverte, Hello, heartbeat, Identify (faux token → 4004).
import { appendFileSync } from 'node:fs';
const log = (s: string) => { console.log(s); appendFileSync('out/probe.txt', s + '\n'); };
const wk = await fetch('https://fluxer.app/.well-known/fluxer').then((r) => r.json()).catch((e) => ({ error: String(e) }));
log('well-known endpoints : ' + JSON.stringify(wk?.endpoints ?? wk));
const gb = await fetch('https://api.fluxer.app/v1/gateway/bot', { headers: { Authorization: 'Bot 123.fake' } });
log(`GET /gateway/bot (faux token) : HTTP ${gb.status} ${(await gb.text()).slice(0, 200)}`);
const url = `${wk?.endpoints?.gateway ?? 'wss://gateway.fluxer.app'}?v=1&encoding=json`;
log('connexion à ' + url);
await new Promise<void>((resolve) => {
  const t0 = Date.now();
  const ws = new WebSocket(url);
  const done = setTimeout(() => { log('délai dépassé'); ws.close(); resolve(); }, 20000);
  ws.onmessage = (ev) => {
    const p = JSON.parse(String(ev.data));
    log(`reçu op ${p.op} t=${p.t ?? ''} ${JSON.stringify(p.d).slice(0, 160)} (+${Date.now() - t0} ms)`);
    if (p.op === 10) {
      ws.send(JSON.stringify({ op: 1, d: null }));
      ws.send(JSON.stringify({ op: 2, d: { token: '123456789012345678.fakefakefake', properties: { os: 'Android', browser: 'FluxerHooks', device: 'FluxerHooks' }, presence: { status: 'online', afk: false, mobile: true }, ignored_events: ['TYPING_START'] } }));
    }
  };
  ws.onclose = (ev) => { log(`fermé : code ${ev.code} « ${ev.reason} » (+${Date.now() - t0} ms)`); clearTimeout(done); resolve(); };
  ws.onerror = () => log('erreur WebSocket');
});
