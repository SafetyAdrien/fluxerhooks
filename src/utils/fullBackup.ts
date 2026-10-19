import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { shareTextFile, type ShareResult } from '../platform/files';
import { restoreSecrets, sealSecrets, type SealedSecrets } from './secretsTransfer';

/**
 * Backup complet de l'app : brouillon, sauvegardes, modèles, automatisations et paramètres.
 * Les tokens (compte, bot) restent dans le stockage chiffré de l'appareil ; ils ne sont ajoutés
 * que sur demande, chiffrés par un mot de passe, pour transférer les comptes vers un autre appareil.
 */
const PREFIX = 'fluxerhooks:';

export async function exportFullBackup(opts: { password?: string } = {}): Promise<ShareResult> {
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
  const secrets = opts.password ? await sealSecrets(opts.password) : undefined;
  const json = JSON.stringify({ app: 'fluxerhooks', version: 1, createdAt: new Date().toISOString(), data, ...(secrets ? { secrets } : {}) }, null, 2);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return shareTextFile(`fluxerhooks-backup-${stamp}.json`, json, 'Backup FluxerHooks');
}

/** Le backup contient-il des comptes chiffrés (transfert entre appareils) ? */
export function backupHasAccounts(text: string): boolean {
  try {
    return !!JSON.parse(text)?.secrets;
  } catch {
    return false;
  }
}

/** Un fichier local d'un autre appareil (file:// d'Android, app:// du bureau) n'existe pas ici. */
const foreignUri = (uri: unknown) =>
  typeof uri === 'string' && (Platform.OS === 'web' ? uri.startsWith('file:') : uri.startsWith('app://') || uri.startsWith('blob:'));

function dropForeignFiles(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropForeignFiles);
  if (!v || typeof v !== 'object') return v;
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === 'attachments' && Array.isArray(x)) o[k] = x.filter((a) => !foreignUri((a as any)?.uri)).map(dropForeignFiles);
    else if (k === 'wallpaper' && x && typeof x === 'object' && foreignUri((x as any).uri)) o[k] = { ...(x as object), uri: null };
    else o[k] = dropForeignFiles(x);
  }
  return o;
}

/**
 * Restaure un backup. Avec `password`, les comptes chiffrés sont aussi restaurés dans le stockage
 * sécurisé de cet appareil (WrongPasswordError si le mot de passe est faux, rien n'est alors modifié).
 */
export async function importFullBackup(text: string, password?: string): Promise<{ items: number; accounts: number }> {
  const parsed = JSON.parse(text);
  if (parsed?.app !== 'fluxerhooks' || typeof parsed.data !== 'object') throw new Error('Ce fichier n’est pas un backup FluxerHooks.');
  let accounts = 0;
  if (password && parsed.secrets) accounts = await restoreSecrets(parsed.secrets as SealedSecrets, password);
  const entries = Object.entries(parsed.data as Record<string, unknown>)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([k, v]) => [k, typeof v === 'string' ? v : dropForeignFiles(v)] as const);
  await AsyncStorage.multiSet(entries.map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return { items: entries.length, accounts };
}
