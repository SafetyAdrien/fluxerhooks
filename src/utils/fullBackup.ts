import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Backup complet de l'app : brouillon, sauvegardes, modèles, automatisations et paramètres.
 * Les tokens (compte, bot) sont dans le Keystore et ne sont jamais exportés.
 */
const PREFIX = 'fluxerhooks:';

export async function exportFullBackup(): Promise<string> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  const pairs = await AsyncStorage.multiGet(keys);
  const data: Record<string, unknown> = {};
  pairs.forEach(([k, v]) => {
    if (v == null) return;
    try {
      data[k] = JSON.parse(v);
    } catch {
      data[k] = v;
    }
  });
  const json = JSON.stringify({ app: 'fluxerhooks', version: 1, createdAt: new Date().toISOString(), data }, null, 2);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const path = `${FS.cacheDirectory}fluxerhooks-backup-${stamp}.json`;
  await FS.writeAsStringAsync(path, json);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Backup FluxerHooks' });
  return path;
}

export async function importFullBackup(text: string): Promise<number> {
  const parsed = JSON.parse(text);
  if (parsed?.app !== 'fluxerhooks' || typeof parsed.data !== 'object') throw new Error('Ce fichier n’est pas un backup FluxerHooks.');
  const entries = Object.entries(parsed.data as Record<string, unknown>).filter(([k]) => k.startsWith(PREFIX));
  await AsyncStorage.multiSet(entries.map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return entries.length;
}
