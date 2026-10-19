import { HISTORY_STORAGE_KEY, HISTORY_SYNC_MAX, LIST_KEYS, WHOLE_KEYS } from './config';

/**
 * Découpage des données locales en « entrées » synchronisées :
 * - une entrée par clé simple (paramètres, journal des automatisations) ;
 * - pour les listes (sauvegardes, modèles, automatisations), une entrée par élément
 *   (`backups#<id>`) plus l'ordre (`backups#order`) : deux appareils peuvent ajouter
 *   chacun un modèle sans que l'un efface l'autre ;
 * - pour l'historique, une entrée par étape (`history#<id>`), sans la position actuelle.
 * Le brouillon de l'éditeur n'est pas synchronisé.
 */
export type Entries = Record<string, unknown>;

const isLocalFile = (uri: unknown) => typeof uri === 'string' && /^(file:|app:|blob:|content:)/.test(uri);

/**
 * Les paramètres propres à l'appareil ne quittent pas l'appareil : image de fond locale et
 * instance Fluxer (adresse de connexion de cet appareil).
 */
function stripDeviceSettings(s: any) {
  if (!s || typeof s !== 'object') return s;
  const { instance: _instance, ...rest } = s;
  if (rest.wallpaper && isLocalFile(rest.wallpaper.uri)) return { ...rest, wallpaper: { ...rest.wallpaper, uri: null } };
  return rest;
}

function parse(raw: string | null | undefined): unknown {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Entrées d'une clé de stockage, à partir de sa valeur brute. */
export function entriesOf(storageKey: string, rawValue: string | null | undefined): Entries {
  const value = parse(rawValue);
  if (value === undefined) return {};
  if (storageKey in WHOLE_KEYS) {
    const name = WHOLE_KEYS[storageKey];
    return { [name]: name === 'settings' ? stripDeviceSettings(value) : value };
  }
  const name = LIST_KEYS[storageKey];
  if (storageKey === HISTORY_STORAGE_KEY) {
    const out: Entries = {};
    const list = (value as any)?.entries;
    if (Array.isArray(list)) for (const el of list) if (el && typeof el === 'object' && el.id != null) out[`${name}#${el.id}`] = el;
    return out;
  }
  if (!Array.isArray(value)) return { [`${name}#order`]: [] };
  const out: Entries = {};
  const order: string[] = [];
  value.forEach((el: any, i) => {
    const id = el && typeof el === 'object' && el.id != null ? String(el.id) : `idx${i}`;
    order.push(id);
    out[`${name}#${id}`] = el;
  });
  out[`${name}#order`] = order;
  return out;
}

/** Clé de stockage à laquelle appartient une entrée. */
export function storageKeyOf(entryKey: string): string | null {
  const base = entryKey.split('#')[0];
  for (const [k, n] of Object.entries(WHOLE_KEYS)) if (n === entryKey) return k;
  for (const [k, n] of Object.entries(LIST_KEYS)) if (n === base && entryKey.includes('#')) return k;
  return null;
}

/**
 * Reconstruit la valeur brute d'une clé de stockage à partir de ses entrées.
 * `localRaw` sert à conserver ce qui est propre à l'appareil (fond d'écran local).
 */
export function valueOf(storageKey: string, entries: Entries, localRaw: string | null | undefined): string | null {
  if (storageKey in WHOLE_KEYS) {
    const name = WHOLE_KEYS[storageKey];
    if (!(name in entries)) return null;
    let v: any = entries[name];
    if (name === 'settings' && v && typeof v === 'object') {
      const local: any = parse(localRaw);
      const localUri = local?.wallpaper?.uri;
      if (isLocalFile(localUri) && !v.wallpaper?.uri) v = { ...v, wallpaper: { ...(v.wallpaper ?? {}), uri: localUri } };
      if (local?.instance) v = { ...v, instance: local.instance };
    }
    return JSON.stringify(v);
  }
  const name = LIST_KEYS[storageKey];
  const prefix = `${name}#`;
  const items = new Map<string, unknown>();
  for (const [k, v] of Object.entries(entries)) if (k.startsWith(prefix) && k !== `${name}#order`) items.set(k.slice(prefix.length), v);
  if (storageKey === HISTORY_STORAGE_KEY) {
    // Étapes des deux appareils rangées par date ; la position reste celle de cet appareil.
    const local: any = parse(localRaw);
    const steps = [...items.values()]
      .filter((e: any) => e && typeof e === 'object' && e.state)
      .sort((a: any, b: any) => (a.at ?? 0) - (b.at ?? 0))
      .slice(-HISTORY_SYNC_MAX);
    const cursor = local && typeof local === 'object' && 'cursor' in local ? local.cursor ?? null : null;
    return JSON.stringify({ entries: steps, cursor });
  }
  const order = Array.isArray(entries[`${name}#order`]) ? (entries[`${name}#order`] as string[]) : [];
  const list: unknown[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    if (items.has(id) && !seen.has(id)) {
      list.push(items.get(id));
      seen.add(id);
    }
  }
  // Éléments arrivés d'un autre appareil sans être encore dans l'ordre connu : en tête de liste.
  const extra = [...items.keys()].filter((id) => !seen.has(id));
  return JSON.stringify([...extra.map((id) => items.get(id)), ...list]);
}

/** Empreinte rapide (FNV-1a 53 bits) d'une valeur, pour détecter les changements. */
export function hashOf(v: unknown): string {
  const s = JSON.stringify(v) ?? 'undefined';
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}:${s.length}`;
}
