import { randomUUID } from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import { desktop } from '../platform/desktop';
import { LINK_PORT, META, SYNCED_KEYS, WHOLE_KEYS } from './config';
import { fromB64url, fromUtf8, open, randomKey, seal, toB64url, utf8 } from './crypto';
import { entriesOf, hashOf, storageKeyOf, valueOf } from './model';
import { editTimes, emitExternalChange, freeze, onLocalChange, raw, unfreeze } from './storageHook';
import { canHost, devicePlatform, deviceName, lanRequest, localAddresses, onIncomingLive, openLive, type LiveHandlers } from './transport';

/**
 * Connexion d'appareils.
 *
 * 1. Liaison : FluxerHooks Desktop affiche un code (QR) contenant ses adresses locales et une clé
 *    à usage unique. L'autre appareil le lit et s'annonce ; les deux vérifient qu'ils sont
 *    connectés au même compte Fluxer, puis échangent une clé de liaison permanente.
 * 2. Synchro automatique : dès que deux appareils liés se trouvent sur le même réseau, ils
 *    comparent l'index de leurs données (empreinte + date de modification de chaque entrée) ;
 *    pour chaque entrée, la version la plus récente gagne et seule elle circule.
 *    Les échanges sont chiffrés (AES-256-GCM) avec la clé de liaison.
 *
 * Desktop héberge le serveur local (port 47321) ; Android est toujours client.
 */

export interface Link {
  peerId: string;
  name: string;
  platform: string;
  accountId: string;
  key: string; // base64url
  addrs: string[]; // http://ip:port
  createdAt: number;
  lastSync?: number;
  /** Session Fluxer de l'appareil lié (id_hash), pour le reconnaître dans la liste des sessions du compte. */
  sessionId?: string;
}

export type LinkState = 'idle' | 'syncing' | 'ok' | 'live' | 'offline' | 'other-account' | 'error';
export interface LinkStatus {
  state: LinkState;
  error?: string;
  at?: number;
}
export type StartMode = 'merge' | 'mine' | 'theirs';

interface IndexEntry {
  h: string;
  t: number;
  del?: boolean;
}
type Index = Record<string, IndexEntry>;
interface WireEntry extends IndexEntry {
  key: string;
  value?: unknown;
}

const FRESH_MS = 5 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- État ---------- */

let accountId: string | null = null;
/** Session Fluxer de cet appareil (id_hash de la session « current »), échangée avec les appareils liés. */
let sessionId: string | null = null;
export function setSessionId(id: string | null) {
  sessionId = id;
}
let remount: (() => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();
const statuses = new Map<string, LinkStatus>();
const listeners = new Set<() => void>();
let linksCache: Link[] | null = null;
const lastScan = new Map<string, number>();

function emit() {
  listeners.forEach((l) => l());
}
export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
export const statusOf = (peerId: string): LinkStatus => statuses.get(peerId) ?? { state: 'idle' };
function setStatus(peerId: string, s: LinkStatus) {
  statuses.set(peerId, { ...s, at: Date.now() });
  emit();
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

export function setRemount(fn: (() => void) | null) {
  remount = fn;
}

let device: string | null = null;
export async function deviceId() {
  if (device) return device;
  device = await raw.getItem(META.device).catch(() => null);
  if (!device) {
    device = randomUUID();
    await raw.setItem(META.device, device).catch(() => {});
  }
  return device;
}

export async function getLinks(): Promise<Link[]> {
  if (linksCache) return linksCache;
  try {
    linksCache = JSON.parse((await raw.getItem(META.links)) ?? '[]') ?? [];
  } catch {
    linksCache = [];
  }
  return linksCache!;
}
async function saveLinks(list: Link[]) {
  linksCache = list;
  await raw.setItem(META.links, JSON.stringify(list));
  emit();
  updateServer();
  for (const [peer, c] of live) if (!list.some((l) => l.peerId === peer)) c.socketClose();
  setTimeout(() => maintainLive(), 50);
}
async function patchLink(peerId: string, patch: Partial<Link>) {
  const list = await getLinks();
  await saveLinks(list.map((l) => (l.peerId === peerId ? { ...l, ...patch } : l)));
}
export async function removeLink(peerId: string) {
  await saveLinks((await getLinks()).filter((l) => l.peerId !== peerId));
  statuses.delete(peerId);
}

/** Compte Fluxer actuellement connecté sur cet appareil (null = aucun). */
export function setAccount(id: string | null) {
  if (id === accountId) return;
  accountId = id;
  emit();
  updateServer();
  closeAllLive();
  if (id) {
    syncAll();
    maintainLive();
  }
}
export const currentAccount = () => accountId;

/* ---------- Index des données ---------- */

async function readLocal(): Promise<Record<string, string | null>> {
  const pairs = await raw.multiGet(SYNCED_KEYS);
  const out: Record<string, string | null> = {};
  pairs.forEach(([k, v]) => (out[k] = v));
  return out;
}
async function readIndex(): Promise<Index> {
  try {
    return JSON.parse((await raw.getItem(META.index)) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
const saveIndex = (idx: Index) => raw.setItem(META.index, JSON.stringify(idx));

/** Met l'index à jour d'après les données locales ; renvoie l'index et les valeurs actuelles. */
async function buildIndex(): Promise<{ idx: Index; values: Record<string, unknown> }> {
  const local = await readLocal();
  const times = await editTimes();
  const now = Date.now();
  const idx = await readIndex();
  const values: Record<string, unknown> = {};
  for (const sk of SYNCED_KEYS) {
    for (const [ek, v] of Object.entries(entriesOf(sk, local[sk]))) {
      values[ek] = v;
      const h = hashOf(v);
      const e = idx[ek];
      if (!e || e.del || e.h !== h) idx[ek] = { h, t: times[sk] ?? now };
    }
  }
  for (const ek of Object.keys(idx)) {
    if (ek in values || idx[ek].del) continue;
    const sk = storageKeyOf(ek);
    // Seuls des éléments de liste peuvent être supprimés, et seulement si la liste existe ici.
    if (!sk || sk in WHOLE_KEYS || ek.endsWith('#order') || local[sk] == null) continue;
    idx[ek] = { h: '', t: times[sk] ?? now, del: true };
  }
  await saveIndex(idx);
  return { idx, values };
}

const newer = (a?: IndexEntry, b?: IndexEntry) => {
  if (!a) return false;
  if (!b) return true;
  if (a.h === b.h && !!a.del === !!b.del) return false;
  if (a.t !== b.t) return a.t > b.t;
  return a.h > b.h;
};

/** Applique des entrées reçues d'un appareil lié (plus récentes que les nôtres). */
async function applyRemote(entries: WireEntry[]) {
  if (!entries.length) return;
  const bySk = new Map<string, WireEntry[]>();
  for (const e of entries) {
    const sk = storageKeyOf(e.key);
    if (!sk) continue;
    bySk.set(sk, [...(bySk.get(sk) ?? []), e]);
  }
  const keys = [...bySk.keys()];
  freeze(keys);
  const changed: string[] = [];
  try {
    const local = await readLocal();
    for (const [sk, list] of bySk) {
      const cur = entriesOf(sk, local[sk]);
      for (const e of list) {
        if (e.del) delete cur[e.key];
        else cur[e.key] = e.value;
      }
      const next = valueOf(sk, cur, local[sk]);
      if (next != null && next !== local[sk]) {
        await raw.setItem(sk, next);
        changed.push(sk);
      }
    }
    const idx = await readIndex();
    for (const e of entries) idx[e.key] = e.del ? { h: '', t: e.t, del: true } : { h: hashOf(e.value), t: e.t };
    await saveIndex(idx);
  } finally {
    // Les écrans concernés relisent leurs données tout de suite. Le verrou ne dure que le temps du
    // rafraîchissement (une écriture différée de l'ancien état est ignorée), pas plus : une modification
    // faite juste après par l'utilisateur est bien enregistrée et envoyée.
    emitExternalChange(changed);
    if (changed.length) setTimeout(() => unfreeze(keys), 150);
    else unfreeze(keys);
  }
}

/** Données de départ choisies à la liaison : on « vieillit » ou « rajeunit » l'index local. */
async function prepareStart(mode: StartMode) {
  if (mode === 'merge') return;
  const { idx } = await buildIndex();
  const t = mode === 'mine' ? Date.now() : 0;
  for (const k of Object.keys(idx)) idx[k] = { ...idx[k], t };
  await saveIndex(idx);
}

/* ---------- Côté serveur (Desktop) ---------- */

interface PairingSession {
  secret: Uint8Array;
  expiresAt: number;
  code: string;
  mode: StartMode;
  done?: (link: Link) => void;
}
let pairing: PairingSession | null = null;

export async function myAddresses(): Promise<string[]> {
  const port = desktop?.link ? await desktop.link.port() : LINK_PORT;
  return (await localAddresses()).map((ip) => `http://${ip}:${port || LINK_PORT}`);
}

/** Desktop : démarre une liaison et renvoie le code à afficher (QR). Valable 5 minutes. */
export async function startPairing(onDone: (link: Link) => void): Promise<{ code: string; expiresAt: number }> {
  if (!canHost()) throw new Error('Seul FluxerHooks Desktop peut afficher un code de connexion.');
  if (!accountId) throw new Error('Connecte-toi à ton compte Fluxer pour connecter un appareil.');
  await desktop!.link!.serve(true);
  const secret = randomKey();
  const expiresAt = Date.now() + FRESH_MS;
  const payload = { v: 1, h: await myAddresses(), d: await deviceId(), n: deviceName(), p: devicePlatform(), a: accountId, k: toB64url(secret), x: expiresAt };
  const code = `FHLINK1.${toB64url(utf8(JSON.stringify(payload)))}`;
  pairing = { secret, expiresAt, code, mode: 'merge', done: onDone };
  return { code, expiresAt };
}
export function stopPairing() {
  pairing = null;
  updateServer();
}

const json = (status: number, body: unknown) => ({ status, body: JSON.stringify(body) });

/** Traite une requête reçue par le serveur local du bureau (relayée par le processus principal). */
export async function handleRequest(req: { method: string; path: string; headers: Record<string, string>; body: string }) {
  const path = req.path.replace(/\?.*$/, '');
  if (path === '/fluxerhooks/hello') return json(200, { app: 'fluxerhooks', v: 1, d: await deviceId() });
  let body: any = {};
  try {
    body = req.body ? JSON.parse(req.body) : {};
  } catch {
    return json(400, { error: 'bad_json' });
  }
  if (path === '/fluxerhooks/pair' && req.method === 'POST') {
    const p = pairing;
    if (!p || p.expiresAt < Date.now()) return json(410, { error: 'no_pairing' });
    let hi: any;
    try {
      hi = open(p.secret, body.c, 'pair');
    } catch {
      return json(403, { error: 'bad_secret' });
    }
    if (Math.abs(Date.now() - Number(hi.ts)) > FRESH_MS) return json(403, { error: 'stale' });
    if (!accountId || hi.a !== accountId) return json(409, { error: 'other_account' });
    const key = randomKey();
    const addrs = Array.isArray(hi.h) ? hi.h.filter((a: unknown) => typeof a === 'string' && /^http:\/\/[\d.]+:\d+$/.test(a)).slice(0, 4) : [];
    const link: Link = { peerId: String(hi.d), name: String(hi.n || 'Appareil'), platform: String(hi.p || ''), accountId, key: toB64url(key), addrs, createdAt: Date.now(), sessionId: typeof hi.s === 'string' ? hi.s : undefined };
    await saveLinks([...(await getLinks()).filter((l) => l.peerId !== link.peerId), link]);
    pairing = null;
    p.done?.(link);
    return json(200, { c: seal(p.secret, { d: await deviceId(), n: deviceName(), p: devicePlatform(), a: accountId, s: sessionId, key: link.key, ts: Date.now() }, 'pair-ok') });
  }
  if ((path === '/fluxerhooks/sync/index' || path === '/fluxerhooks/sync/push') && req.method === 'POST') {
    const peer = String(body.d ?? '');
    const link = (await getLinks()).find((l) => l.peerId === peer);
    if (!link) return json(401, { error: 'unknown_device' });
    const key = fromB64url(link.key);
    let msg: any;
    try {
      msg = open(key, body.c, path);
    } catch {
      return json(403, { error: 'bad_key' });
    }
    if (Math.abs(Date.now() - Number(msg.ts)) > FRESH_MS) return json(403, { error: 'stale' });
    if (!accountId || accountId !== link.accountId || msg.a !== link.accountId) return json(409, { error: 'other_account' });
    return enqueue(async () => {
      if (path === '/fluxerhooks/sync/index') {
        if (typeof msg.s === 'string' && msg.s !== link.sessionId) await patchLink(link.peerId, { sessionId: msg.s });
        const { idx, values } = await buildIndex();
        const theirs: Index = msg.idx ?? {};
        const send: WireEntry[] = [];
        const want: string[] = [];
        for (const k of new Set([...Object.keys(idx), ...Object.keys(theirs)])) {
          if (newer(idx[k], theirs[k])) send.push({ key: k, ...idx[k], value: idx[k].del ? undefined : values[k] });
          else if (newer(theirs[k], idx[k])) want.push(k);
        }
        return json(200, { c: seal(key, { entries: send, want, s: sessionId, ts: Date.now() }, `${path}:reply`) });
      }
      await applyRemote((msg.entries ?? []) as WireEntry[]);
      await patchLink(link.peerId, { lastSync: Date.now() });
      setStatus(link.peerId, { state: 'ok' });
      return json(200, { c: seal(key, { ok: true, ts: Date.now() }, `${path}:reply`) });
    });
  }
  return json(404, { error: 'not_found' });
}

/** Le serveur local tourne tant qu'une liaison existe ou est en cours. */
async function updateServer() {
  if (!canHost()) return;
  const want = !!pairing || (await getLinks()).length > 0;
  desktop!.link!.serve(want).catch(() => {});
}

/* ---------- Côté client ---------- */

function parseCode(code: string): any {
  const m = /FHLINK1\.([A-Za-z0-9_-]+)/.exec(code.trim());
  if (!m) throw new Error('Code de connexion invalide.');
  try {
    return JSON.parse(fromUtf8(fromB64url(m[1])));
  } catch {
    throw new Error('Code de connexion invalide.');
  }
}

/** Lit un code de connexion (QR) et lie cet appareil à l'appareil qui l'affiche. */
export async function pairWithCode(code: string, mode: StartMode): Promise<Link> {
  const p = parseCode(code);
  if (!accountId) throw new Error('Connecte-toi à ton compte Fluxer pour connecter un appareil.');
  if (p.a !== accountId) throw new Error('L’autre appareil est connecté à un autre compte Fluxer.');
  if (Number(p.x) < Date.now()) throw new Error('Ce code de connexion a expiré. Affiche-en un nouveau.');
  if (p.d === (await deviceId())) throw new Error('Ce code vient de cet appareil.');
  const secret = fromB64url(p.k);
  // Un autre ordinateur ouvre aussi son serveur local et donne ses adresses (synchro dans les deux sens).
  if (canHost()) await desktop!.link!.serve(true);
  const mine = canHost() ? await myAddresses() : [];
  const hello = seal(secret, { d: await deviceId(), n: deviceName(), p: devicePlatform(), a: accountId, h: mine, s: sessionId, ts: Date.now() }, 'pair');
  let lastErr = 'Appareil introuvable sur le réseau. Vérifie que les deux appareils sont sur le même Wi-Fi.';
  for (const addr of (p.h as string[]) ?? []) {
    const r = await lanRequest(`${addr}/fluxerhooks/pair`, 'POST', JSON.stringify({ c: hello }), 8000);
    if (r.status === 0) continue;
    let b: any = {};
    try {
      b = JSON.parse(r.body);
    } catch {
      b = {};
    }
    if (r.status === 409) throw new Error('L’autre appareil est connecté à un autre compte Fluxer.');
    if (r.status === 410) throw new Error('Ce code de connexion a expiré. Affiche-en un nouveau.');
    if (r.status !== 200) {
      lastErr = 'La connexion a été refusée par l’autre appareil.';
      continue;
    }
    const ok = open(secret, b.c, 'pair-ok');
    if (ok.a !== accountId) throw new Error('L’autre appareil est connecté à un autre compte Fluxer.');
    const link: Link = { peerId: String(ok.d), name: String(ok.n || 'FluxerHooks Desktop'), platform: String(ok.p || ''), accountId, key: String(ok.key), addrs: [addr], createdAt: Date.now(), sessionId: typeof ok.s === 'string' ? ok.s : undefined };
    await saveLinks([...(await getLinks()).filter((l) => l.peerId !== link.peerId), link]);
    await enqueue(() => prepareStart(mode));
    syncWith(link);
    return link;
  }
  throw new Error(lastErr);
}

async function hello(addr: string, peerId: string, timeoutMs: number) {
  const r = await lanRequest(`${addr}/fluxerhooks/hello`, 'GET', undefined, timeoutMs);
  if (r.status !== 200) return false;
  try {
    return JSON.parse(r.body).d === peerId;
  } catch {
    return false;
  }
}

/** Retrouve un appareil lié sur le réseau : dernières adresses connues, sinon le réseau local. */
async function locate(link: Link): Promise<string | null> {
  for (const a of link.addrs) if (await hello(a, link.peerId, 2500)) return a;
  const last = lastScan.get(link.peerId) ?? 0;
  if (Date.now() - last < 120_000) return null;
  lastScan.set(link.peerId, Date.now());
  for (const ip of await localAddresses()) {
    const prefix = ip.split('.').slice(0, 3).join('.');
    const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`).filter((h) => h !== ip);
    for (let i = 0; i < hosts.length; i += 48) {
      const batch = hosts.slice(i, i + 48).map((h) => `http://${h}:${LINK_PORT}`);
      const found = await Promise.all(batch.map(async (a) => ((await hello(a, link.peerId, 900)) ? a : null)));
      const hit = found.find(Boolean);
      if (hit) {
        await patchLink(link.peerId, { addrs: [hit, ...link.addrs.filter((x) => x !== hit)].slice(0, 4) });
        return hit;
      }
    }
  }
  return null;
}

/** Qui lance la synchro : Android toujours ; entre deux bureaux, celui dont l'identifiant est le plus petit. */
async function initiates(link: Link) {
  if (!canHost()) return true;
  if (link.platform === 'android' || link.platform === 'ios' || link.platform === 'web') return false;
  return (await deviceId()) < link.peerId;
}

async function post(addr: string, link: Link, path: string, payload: object) {
  const key = fromB64url(link.key);
  const body = JSON.stringify({ d: await deviceId(), c: seal(key, { ...payload, a: link.accountId, ts: Date.now() }, path) });
  const r = await lanRequest(`${addr}${path}`, 'POST', body, 60_000);
  if (r.status === 409) throw Object.assign(new Error('other_account'), { code: 'other-account' });
  if (r.status === 401) throw new Error('Cette liaison n’est plus reconnue par l’autre appareil. Reconnecte-le.');
  if (r.status !== 200) throw new Error(r.status ? `Erreur de synchronisation (${r.status}).` : 'Appareil injoignable.');
  return open<any>(key, JSON.parse(r.body).c, `${path}:reply`);
}

export function syncWith(link: Link) {
  return enqueue(async () => {
    if (!accountId || accountId !== link.accountId) return setStatus(link.peerId, { state: 'other-account' });
    if (!(await initiates(link))) return;
    if (live.get(link.peerId)?.ready) return;
    setStatus(link.peerId, { state: 'syncing' });
    try {
      const addr = await locate(link);
      if (!addr) return setStatus(link.peerId, { state: 'offline' });
      const { idx, values } = await buildIndex();
      const me = await deviceId();
      const r1 = await post(addr, link, '/fluxerhooks/sync/index', { idx, from: me, s: sessionId });
      if (typeof r1.s === 'string' && r1.s !== link.sessionId) await patchLink(link.peerId, { sessionId: r1.s });
      const want: string[] = r1.want ?? [];
      await applyRemote((r1.entries ?? []) as WireEntry[]);
      const fresh = want.length ? await buildIndex() : { idx, values };
      const entries: WireEntry[] = want.filter((k) => fresh.idx[k]).map((k) => ({ key: k, ...fresh.idx[k], value: fresh.idx[k].del ? undefined : fresh.values[k] }));
      await post(addr, link, '/fluxerhooks/sync/push', { entries, from: me });
      await patchLink(link.peerId, { lastSync: Date.now() });
      setStatus(link.peerId, { state: 'ok' });
    } catch (e: any) {
      if (e?.code === 'other-account') setStatus(link.peerId, { state: 'other-account' });
      else setStatus(link.peerId, { state: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  });
}

/** Synchronise avec tous les appareils liés au compte actuel. */
export async function syncAll() {
  for (const l of await getLinks()) if (l.accountId === accountId) syncWith(l);
}

let changeTimer: ReturnType<typeof setTimeout> | null = null;
let liveTimer: ReturnType<typeof setTimeout> | null = null;
onLocalChange(() => {
  // Appareils connectés en direct : envoi quasi instantané. Les autres : synchro classique.
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = setTimeout(() => pushLive(), 120);
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = setTimeout(() => syncAll(), 3000);
});

/* ---------- Connexion en direct (temps réel) ---------- */

/**
 * Chaque paire d'appareils liés garde une connexion WebSocket ouverte (le téléphone, ou le bureau qui
 * « initie », se connecte au serveur local de l'autre). À la connexion, chacun envoie l'index de ses
 * données et reçoit ce qui est plus récent chez l'autre ; ensuite, chaque modification est envoyée
 * dans l'instant et appliquée à l'écran sans redémarrage. Tout est chiffré avec la clé de la liaison.
 */
interface LiveConn {
  link: Link;
  key: Uint8Array;
  socketSend: (data: string) => void;
  socketClose: () => void;
  peerIdx: Index;
  ready: boolean;
  lastSeen: number;
}
const LIVE_PATH = '/fluxerhooks/live';
const live = new Map<string, LiveConn>();
const connecting = new Set<string>();
let myId = '';

function liveSend(c: LiveConn, t: string, payload: object) {
  try {
    c.socketSend(JSON.stringify({ d: myId, t, c: seal(c.key, { ...payload, a: c.link.accountId, ts: Date.now() }, `live:${t}`) }));
  } catch {
    // connexion fermée entre-temps
  }
}

/** Envoie à l'appareil lié tout ce qui est plus récent ici que ce qu'il a. */
async function sendNewer(c: LiveConn) {
  const { idx, values } = await buildIndex();
  const out: WireEntry[] = [];
  for (const k of Object.keys(idx)) {
    if (!newer(idx[k], c.peerIdx[k])) continue;
    out.push({ key: k, ...idx[k], value: idx[k].del ? undefined : values[k] });
    c.peerIdx[k] = idx[k];
  }
  if (out.length) liveSend(c, 'entries', { entries: out });
  await patchLink(c.link.peerId, { lastSync: Date.now() });
  setStatus(c.link.peerId, { state: 'live' });
}

function pushLive() {
  for (const c of live.values()) if (c.ready) enqueue(() => sendNewer(c));
}

function handleLive(c: LiveConn, raw: string, incoming: boolean) {
  let m: any;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  c.lastSeen = Date.now();
  let p: any;
  try {
    p = open(c.key, m.c, `live:${m.t}`);
  } catch {
    return c.socketClose();
  }
  if (Math.abs(Date.now() - Number(p.ts)) > FRESH_MS) return;
  if (!accountId || p.a !== accountId || c.link.accountId !== accountId) {
    setStatus(c.link.peerId, { state: 'other-account' });
    return c.socketClose();
  }
  if (m.t === 'hello') {
    c.peerIdx = p.idx ?? {};
    if (typeof p.s === 'string' && p.s !== c.link.sessionId) patchLink(c.link.peerId, { sessionId: p.s });
    if (incoming) {
      enqueue(async () => {
        const { idx } = await buildIndex();
        liveSend(c, 'hello', { idx, s: sessionId });
      });
    }
    c.ready = true;
    enqueue(() => sendNewer(c));
  } else if (m.t === 'entries') {
    const entries = (p.entries ?? []) as WireEntry[];
    enqueue(async () => {
      await applyRemote(entries);
      for (const e of entries) c.peerIdx[e.key] = { h: e.del ? '' : hashOf(e.value), t: e.t, ...(e.del ? { del: true } : {}) };
      await patchLink(c.link.peerId, { lastSync: Date.now() });
      setStatus(c.link.peerId, { state: 'live' });
    });
  } else if (m.t === 'ping') liveSend(c, 'pong', {});
}

function attach(link: Link, socketSend: (d: string) => void, socketClose: () => void): LiveConn {
  live.get(link.peerId)?.socketClose();
  const c: LiveConn = { link, key: fromB64url(link.key), socketSend, socketClose, peerIdx: {}, ready: false, lastSeen: Date.now() };
  live.set(link.peerId, c);
  return c;
}
function detach(c: LiveConn) {
  if (live.get(c.link.peerId) !== c) return;
  live.delete(c.link.peerId);
  if (statusOf(c.link.peerId).state === 'live') setStatus(c.link.peerId, { state: 'idle' });
  setTimeout(() => maintainLive(), 2000);
}
function closeAllLive() {
  for (const c of live.values()) c.socketClose();
  live.clear();
}

/** Ouvre la connexion en direct vers chaque appareil lié du compte (côté qui initie). */
export async function maintainLive() {
  if (!accountId) return;
  if (Platform.OS !== 'web' && AppState.currentState !== 'active') return;
  myId = await deviceId();
  for (const link of await getLinks()) {
    if (link.accountId !== accountId || live.has(link.peerId) || connecting.has(link.peerId)) continue;
    if (!(await initiates(link))) continue;
    connecting.add(link.peerId);
    (async () => {
      try {
        const addr = await locate(link);
        if (!addr) return setStatus(link.peerId, { state: 'offline' });
        let c: LiveConn | null = null;
        const h: LiveHandlers = {
          onOpen: () => {
            enqueue(async () => {
              const { idx } = await buildIndex();
              if (c) liveSend(c, 'hello', { idx, s: sessionId });
            });
          },
          onMessage: (d) => c && handleLive(c, d, false),
          onClose: () => c && detach(c),
        };
        const sock = await openLive(addr.replace(/^http:/, 'ws:') + LIVE_PATH, h);
        if (sock) c = attach(link, sock.send, sock.close);
      } finally {
        connecting.delete(link.peerId);
      }
    })();
  }
}

// Battement de cœur : détecte une connexion coupée (Wi-Fi perdu, veille) et la rouvre.
setInterval(() => {
  const now = Date.now();
  for (const c of live.values()) {
    if (now - c.lastSeen > 45_000) c.socketClose();
    else if (c.ready) liveSend(c, 'ping', {});
  }
  maintainLive();
}, 15_000);
AppState.addEventListener('change', (s) => {
  if (Platform.OS === 'web') return;
  // Téléphone : connexion fermée en arrière-plan, rouverte (avec rattrapage) au retour dans l'app.
  if (s === 'active') maintainLive();
  else if (s === 'background') closeAllLive();
});

/* ---------- Automatisations : un seul appareil les exécute ---------- */

/**
 * Une automatisation est exécutée par l'appareil qui l'a lancée la première fois (`device`).
 * Les autres appareils liés la laissent passer ; si cet appareil n'est plus lié, un autre la reprend.
 */
export async function automationRunner(current?: string): Promise<{ run: boolean; device: string }> {
  const me = await deviceId();
  if (!current || current === me) return { run: true, device: me };
  const linked = (await getLinks()).some((l) => l.peerId === current);
  return linked ? { run: false, device: current } : { run: true, device: me };
}

export async function initLinkServer() {
  if (!canHost()) return;
  myId = await deviceId();
  desktop!.link!.onRequest((req) => handleRequest(req));
  // Connexions en direct entrantes : l'appareil se présente (« hello ») avec son identifiant.
  onIncomingLive((send, close) => {
    let c: LiveConn | null = null;
    const h: LiveHandlers = {
      onOpen: () => {},
      onMessage: (d) => {
        if (!c) {
          let m: any;
          try {
            m = JSON.parse(d);
          } catch {
            return close();
          }
          const link = (linksCache ?? []).find((l) => l.peerId === m?.d);
          if (!link || m.t !== 'hello') return close();
          c = attach(link, send, close);
        }
        handleLive(c, d, true);
      },
      onClose: () => c && detach(c),
    };
    return h;
  });
  await getLinks();
  await updateServer();
}


