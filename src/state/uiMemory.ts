import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Mémoire de l'interface de l'éditeur : sections ouvertes/fermées et position de défilement.
 * Gardée en mémoire pendant l'utilisation et sauvegardée sur le téléphone (écriture différée),
 * pour retrouver l'éditeur exactement au même endroit, même après redémarrage de l'app.
 */
const KEY = 'fluxerhooks:ui-memory:v1';
const MAX_KEYS = 600;
let mem: Record<string, unknown> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

export async function loadUiMemory() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) mem = JSON.parse(raw) ?? {};
  } catch {
    mem = {};
  }
}

export function getUi<T>(key: string, fallback: T): T {
  return key in mem ? (mem[key] as T) : fallback;
}

export function setUi(key: string, value: unknown) {
  // L'insertion récente passe en fin d'objet : on peut élaguer les plus anciennes.
  delete mem[key];
  mem[key] = value;
  const keys = Object.keys(mem);
  if (keys.length > MAX_KEYS) keys.slice(0, keys.length - MAX_KEYS).forEach((k) => delete mem[k]);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(mem)).catch(() => {});
  }, 400);
}
