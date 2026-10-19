import AsyncStorage from '@react-native-async-storage/async-storage';
import { META, isSyncedKey } from './config';

/**
 * Observe les écritures de l'app dans AsyncStorage : chaque modification d'une clé synchronisée
 * est datée (« la plus récente gagne » se joue sur l'heure de la modification, pas de la synchro)
 * et déclenche une synchro différée avec les appareils liés. Le moteur écrit, lui, via `raw` pour ne pas se déclencher lui-même.
 * Pendant l'application de données distantes, les clés concernées sont « gelées » : une écriture
 * en retard de l'ancien état (sauvegarde différée de l'éditeur) ne peut pas les écraser.
 */
const S = AsyncStorage as any;
export const raw = {
  getItem: S.getItem.bind(S) as (k: string) => Promise<string | null>,
  setItem: S.setItem.bind(S) as (k: string, v: string) => Promise<void>,
  removeItem: S.removeItem.bind(S) as (k: string) => Promise<void>,
  multiGet: S.multiGet.bind(S) as (keys: readonly string[]) => Promise<readonly [string, string | null][]>,
  multiSet: S.multiSet.bind(S) as (pairs: [string, string][]) => Promise<void>,
  multiRemove: S.multiRemove.bind(S) as (keys: readonly string[]) => Promise<void>,
};

const frozen = new Set<string>();
let dirty: Record<string, number> | null = null;
let dirtyTimer: ReturnType<typeof setTimeout> | null = null;
let listener: ((keys: string[]) => void) | null = null;

async function loadDirty() {
  if (dirty) return dirty;
  try {
    dirty = JSON.parse((await raw.getItem(META.dirty)) ?? '{}') ?? {};
  } catch {
    dirty = {};
  }
  return dirty!;
}

function touched(keys: string[]) {
  const synced = keys.filter(isSyncedKey);
  if (!synced.length) return;
  const now = Date.now();
  loadDirty().then((d) => {
    synced.forEach((k) => (d[k] = now));
    if (dirtyTimer) clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(() => raw.setItem(META.dirty, JSON.stringify(d)).catch(() => {}), 300);
    listener?.(synced);
  });
}

/** Heure de la dernière modification locale de chaque clé synchronisée. */
export async function editTimes(): Promise<Record<string, number>> {
  return { ...(await loadDirty()) };
}

export function onLocalChange(cb: ((keys: string[]) => void) | null) {
  listener = cb;
}

/* ---------- Données reçues d'un appareil lié ---------- */

const external = new Set<(keys: string[]) => void>();
/** Les écrans relisent leurs données sur place quand un appareil lié les a modifiées (sans redémarrer). */
export function onExternalChange(cb: (keys: string[]) => void): () => void {
  external.add(cb);
  return () => {
    external.delete(cb);
  };
}
export function emitExternalChange(keys: string[]) {
  if (keys.length) external.forEach((l) => l(keys));
}

export function freeze(keys: string[]) {
  keys.forEach((k) => frozen.add(k));
}
export function unfreeze(keys: string[]) {
  keys.forEach((k) => frozen.delete(k));
}

let installed = false;
export function installStorageHook() {
  if (installed) return;
  installed = true;
  S.setItem = async (k: string, v: string, cb?: any) => {
    if (frozen.has(k)) return;
    await raw.setItem(k, v);
    touched([k]);
    cb?.(null);
  };
  S.removeItem = async (k: string, cb?: any) => {
    if (frozen.has(k)) return;
    await raw.removeItem(k);
    touched([k]);
    cb?.(null);
  };
  S.multiSet = async (pairs: [string, string][], cb?: any) => {
    const ok = pairs.filter(([k]) => !frozen.has(k));
    await raw.multiSet(ok);
    touched(ok.map(([k]) => k));
    cb?.(null);
  };
  S.multiRemove = async (keys: string[], cb?: any) => {
    const ok = keys.filter((k) => !frozen.has(k));
    await raw.multiRemove(ok);
    touched(ok);
    cb?.(null);
  };
}

installStorageHook();
