import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Backup, DraftMessage, EditorState, Embed } from '../types';
import { uid } from '../utils/factory';

/**
 * Historique d'édition : chaque modification de l'éditeur crée une étape (état complet),
 * reliée à l'étape précédente. Annuler remonte au parent, Rétablir redescend vers l'enfant
 * le plus récent : une modification faite après une annulation ouvre une nouvelle branche
 * sans jamais effacer l'ancienne, qui reste restaurable depuis la chronologie.
 */

export const HISTORY_KEY = 'fluxerhooks:history:v1';
export const HISTORY_MAX = 150;
/** Frappes successives sur le même élément regroupées en une seule étape. */
const COALESCE_MS = 1500;

export type HistoryKind = 'edit' | 'add' | 'remove' | 'move' | 'restore' | 'import' | 'backup' | 'initial';

export interface HistoryEntry {
  id: string;
  parent: string | null;
  at: number;
  kind: HistoryKind;
  /** Libellé en français (clé de traduction), avec variables. */
  label: string;
  vars?: Record<string, string | number>;
  /** Regroupement des frappes : même cible = même groupe. */
  group?: string;
  state: EditorState;
}

export interface HistoryData {
  entries: HistoryEntry[];
  cursor: string | null;
}

/* ---------- Ce qui compte comme un changement ---------- */

const cleanMessage = (m: DraftMessage) => {
  const { collapsed, flash, lastSent, ...rest } = m;
  return rest;
};

/** Signature du contenu : ignore l'affichage (replié/déplié), les indicateurs d'envoi et les infos chargées du serveur. */
export function contentSignature(s: EditorState): string {
  return JSON.stringify({
    t: s.targets.map(({ info, error, ...t }) => t),
    m: s.messages.map(cleanMessage),
  });
}

/* ---------- Description d'un changement ---------- */

const EMBED_PROPS: Record<string, string> = {
  title: 'titre',
  url: 'lien du titre',
  description: 'description',
  color: 'couleur',
  timestamp: 'horodatage',
  author: 'auteur',
  thumbnail: 'miniature',
  image: 'image',
  footer: 'pied de page',
};
const MSG_PROPS: Record<string, string> = {
  content: 'contenu',
  username: 'nom',
  avatar_url: 'avatar',
  attachments: 'fichiers',
  suppressEmbeds: 'options',
  suppressNotifications: 'options',
  mentions: 'mentions',
  threadMode: 'destination',
  thread_id: 'destination',
  thread_name: 'destination',
  applied_tags: 'tags',
  reference: 'message à modifier',
  reply_to: 'réponse',
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function describeEmbed(a: Embed, b: Embed, mi: number, ei: number): Omit<Desc, 'kind'> & { kind?: HistoryKind } {
  const v = { m: mi + 1, e: ei + 1 };
  if (a.fields.length !== b.fields.length) {
    return b.fields.length > a.fields.length
      ? { kind: 'add', label: 'Ajout d’un champ · embed {e} du message {m}', vars: v }
      : { kind: 'remove', label: 'Suppression d’un champ · embed {e} du message {m}', vars: v };
  }
  const ids = (x: Embed) => x.fields.map((f) => f.id).join();
  if (ids(a) !== ids(b)) return { kind: 'move', label: 'Champs réorganisés · embed {e} du message {m}', vars: v };
  for (let i = 0; i < b.fields.length; i++) {
    if (!same(a.fields[i], b.fields[i])) {
      return { label: 'Champ {f} · embed {e} du message {m}', vars: { ...v, f: i + 1 }, group: `f:${b.fields[i].id}` };
    }
  }
  for (const k of Object.keys(EMBED_PROPS)) {
    if (!same((a as any)[k], (b as any)[k])) {
      return { label: 'Embed {e} du message {m} · {p}', vars: { ...v, p: EMBED_PROPS[k] }, group: `e:${b.id}:${k}` };
    }
  }
  return { label: 'Embed {e} du message {m}', vars: v, group: `e:${b.id}` };
}

type Desc = { kind: HistoryKind; label: string; vars?: Record<string, string | number>; group?: string };

export function describeChange(a: EditorState, b: EditorState): Desc {
  // Webhooks / destinations
  if (contentSignature({ targets: a.targets, messages: [] }) !== contentSignature({ targets: b.targets, messages: [] })) {
    if (b.targets.length > a.targets.length) return { kind: 'add', label: 'Ajout d’un webhook' };
    if (b.targets.length < a.targets.length) return { kind: 'remove', label: 'Suppression d’un webhook' };
    const i = b.targets.findIndex((t, k) => !same({ ...t, info: 0, error: 0 }, { ...a.targets[k], info: 0, error: 0 }));
    return { kind: 'edit', label: 'Webhook {n}', vars: { n: i + 1 }, group: `t:${b.targets[i]?.id}` };
  }
  // Messages
  if (b.messages.length > a.messages.length) return { kind: 'add', label: 'Ajout du message {n}', vars: { n: b.messages.length } };
  if (b.messages.length < a.messages.length) {
    const gone = a.messages.findIndex((m) => !b.messages.some((x) => x.id === m.id));
    return { kind: 'remove', label: 'Suppression du message {n}', vars: { n: gone + 1 } };
  }
  if (a.messages.map((m) => m.id).join() !== b.messages.map((m) => m.id).join()) return { kind: 'move', label: 'Messages réorganisés' };
  for (let mi = 0; mi < b.messages.length; mi++) {
    const ma = a.messages[mi];
    const mb = b.messages[mi];
    if (same(cleanMessage(ma), cleanMessage(mb))) continue;
    const v = { m: mi + 1 };
    if (ma.embeds.length !== mb.embeds.length) {
      return mb.embeds.length > ma.embeds.length
        ? { kind: 'add', label: 'Ajout d’un embed · message {m}', vars: v }
        : { kind: 'remove', label: 'Suppression d’un embed · message {m}', vars: v };
    }
    if (ma.embeds.map((e) => e.id).join() !== mb.embeds.map((e) => e.id).join()) return { kind: 'move', label: 'Embeds réorganisés · message {m}', vars: v };
    for (let ei = 0; ei < mb.embeds.length; ei++) {
      if (!same(ma.embeds[ei], mb.embeds[ei])) return { kind: 'edit', ...describeEmbed(ma.embeds[ei], mb.embeds[ei], mi, ei) };
    }
    for (const k of Object.keys(MSG_PROPS)) {
      if (!same((ma as any)[k], (mb as any)[k])) {
        return { kind: 'edit', label: 'Message {m} · {p}', vars: { ...v, p: MSG_PROPS[k] }, group: `m:${mb.id}:${k}` };
      }
    }
    return { kind: 'edit', label: 'Message {m}', vars: v, group: `m:${mb.id}` };
  }
  return { kind: 'edit', label: 'Modification' };
}

/* ---------- Opérations ---------- */

/** Ajoute une étape (ou complète la précédente pendant une frappe continue). */
export function record(h: HistoryData, prev: EditorState, next: EditorState, now = Date.now()): HistoryData {
  const d = describeChange(prev, next);
  const cur = h.entries.find((e) => e.id === h.cursor);
  const isHead = cur && !h.entries.some((e) => e.parent === cur.id);
  if (cur && isHead && d.group && cur.group === d.group && now - cur.at < COALESCE_MS) {
    const merged = { ...cur, at: now, state: next };
    return { ...h, entries: h.entries.map((e) => (e.id === cur.id ? merged : e)) };
  }
  const entry: HistoryEntry = { id: uid(), parent: h.cursor, at: now, ...d, state: next };
  return prune({ entries: [...h.entries, entry], cursor: entry.id });
}

export function addEntry(h: HistoryData, kind: HistoryKind, label: string, state: EditorState, vars?: Record<string, string | number>): HistoryData {
  const entry: HistoryEntry = { id: uid(), parent: h.cursor, at: Date.now(), kind, label, vars, state };
  return prune({ entries: [...h.entries, entry], cursor: entry.id });
}

function prune(h: HistoryData): HistoryData {
  if (h.entries.length <= HISTORY_MAX) return h;
  const entries = h.entries.slice(h.entries.length - HISTORY_MAX);
  const ids = new Set(entries.map((e) => e.id));
  return { ...h, entries: entries.map((e) => (e.parent && !ids.has(e.parent) ? { ...e, parent: null } : e)) };
}

export const undoTarget = (h: HistoryData) => {
  const cur = h.entries.find((e) => e.id === h.cursor);
  return cur?.parent ? h.entries.find((e) => e.id === cur.parent) ?? null : null;
};
export const redoTarget = (h: HistoryData) => {
  const kids = h.entries.filter((e) => e.parent === h.cursor);
  return kids.length ? kids.reduce((a, b) => (b.at > a.at ? b : a)) : null;
};

/** Remet un état de l'historique en gardant l'affichage actuel (sections repliées, infos des webhooks). */
export function applyKeepingUi(current: EditorState, target: EditorState): EditorState {
  const col = new Map(current.messages.map((m) => [m.id, m.collapsed]));
  const info = new Map(current.targets.map((t) => [t.url, t.info]));
  return {
    targets: target.targets.map((t) => ({ ...t, info: t.info ?? info.get(t.url) })),
    messages: target.messages.map((m) => ({ ...m, collapsed: col.get(m.id) ?? m.collapsed, flash: undefined })),
  };
}

/* ---------- Chargement et reprise de l'existant ---------- */

export async function loadHistory(current: EditorState, backups: Backup[]): Promise<HistoryData> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (raw) {
      const h = JSON.parse(raw) as HistoryData;
      if (Array.isArray(h.entries)) {
        // Le brouillon a pu changer sans passer par l'historique : on le raccroche.
        const cur = h.entries.find((e) => e.id === h.cursor);
        if (!cur || contentSignature(cur.state) !== contentSignature(current)) return addEntry(h, 'initial', 'Brouillon retrouvé', current);
        return h;
      }
    }
  } catch {
    // historique illisible : on le reconstruit
  }
  return seedHistory(current, backups);
}

/**
 * Première ouverture avec l'historique : les sauvegardes existantes (par date) puis le brouillon
 * en cours deviennent les premières étapes, pour pouvoir revenir à tout ce qui a été fait avant.
 */
export function seedHistory(current: EditorState, backups: Backup[]): HistoryData {
  let h: HistoryData = { entries: [], cursor: null };
  const sorted = backups
    .filter((b) => b?.state?.messages?.length)
    .slice()
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const b of sorted) {
    const entry: HistoryEntry = {
      id: uid(),
      parent: h.cursor,
      at: Date.parse(b.createdAt) || Date.now(),
      kind: 'backup',
      label: 'Sauvegarde « {name} »',
      vars: { name: b.name },
      state: b.state,
    };
    h = { entries: [...h.entries, entry], cursor: entry.id };
  }
  const last = h.entries[h.entries.length - 1];
  if (!last || contentSignature(last.state) !== contentSignature(current)) {
    h = addEntry(h, 'initial', 'Brouillon en cours', current);
  }
  return prune(h);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function saveHistory(h: HistoryData) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(h)).catch(() => {});
  }, 600);
}
