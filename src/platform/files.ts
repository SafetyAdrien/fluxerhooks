import { Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { desktop } from './desktop';

/**
 * Fichiers selon la plateforme : système de fichiers d'Expo sur Android,
 * pont Electron sur Linux (bureau), API du navigateur sinon.
 */

export type ShareResult = 'shared' | 'saved' | 'cancelled' | 'unavailable';

/** Exporte un fichier texte : feuille de partage sur Android, « Enregistrer sous » sur le bureau. */
export async function shareTextFile(name: string, text: string, dialogTitle: string, mimeType = 'application/json'): Promise<ShareResult> {
  if (desktop) return (await desktop.files.save(name, text)) ? 'saved' : 'cancelled';
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'saved';
  }
  const path = `${FS.cacheDirectory}${name}`;
  await FS.writeAsStringAsync(path, text);
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(path, { mimeType, dialogTitle });
  return 'shared';
}

/** Lit le contenu texte d'un fichier choisi avec expo-document-picker. */
export async function readPickedText(asset: { uri: string; file?: File }): Promise<string> {
  if (Platform.OS === 'web') {
    if (asset.file) return asset.file.text();
    return (await fetch(asset.uri)).text();
  }
  return FS.readAsStringAsync(asset.uri);
}

/** Taille d'un fichier local (0 si inconnue). */
export async function fileSize(uri: string): Promise<number> {
  try {
    if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
    const info = await FS.getInfoAsync(uri);
    return info.exists && 'size' in info ? (info.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * Rend durable un fichier choisi (pièce jointe, image traitée) : sur le bureau il est copié dans les
 * données de l'app (les adresses blob: du navigateur disparaissent à la fermeture). Ailleurs, inchangé.
 */
export async function persistFile(uri: string, name: string, file?: Blob): Promise<string> {
  if (!desktop || uri.startsWith('app://')) return uri;
  try {
    const blob = file ?? (await (await fetch(uri)).blob());
    return await desktop.files.store(name, await blob.arrayBuffer());
  } catch {
    return uri;
  }
}

/** Copie une image dans le stockage permanent de l'app (fond d'écran). */
export async function persistImage(uri: string, prefix: string, file?: Blob): Promise<string> {
  if (Platform.OS === 'web') return persistFile(uri, `${prefix}-${Date.now()}.jpg`, file);
  const dest = `${FS.documentDirectory}${prefix}-${Date.now()}.jpg`;
  await FS.copyAsync({ from: uri, to: dest });
  return dest;
}

/** Supprime un fichier copié par l'app (ignoré s'il ne lui appartient pas). */
export async function removePersisted(uri?: string | null) {
  if (!uri) return;
  try {
    if (desktop) {
      if (uri.startsWith('app://')) await desktop.files.remove(uri);
      return;
    }
    if (Platform.OS !== 'web' && uri.startsWith(FS.documentDirectory ?? '§')) await FS.deleteAsync(uri, { idempotent: true });
  } catch {
    // déjà supprimé
  }
}

/** Formulaire multipart construit au moment de l'envoi (les fichiers web doivent être lus en Blob). */
export class UploadForm {
  private parts: [string, string | { uri: string; name: string; type: string }][] = [];
  append(key: string, value: string | { uri: string; name: string; type: string }) {
    this.parts.push([key, value]);
  }
  async build(): Promise<FormData> {
    const form = new FormData();
    for (const [k, v] of this.parts) {
      if (typeof v === 'string') form.append(k, v);
      else if (Platform.OS === 'web') {
        const blob = await (await fetch(v.uri)).blob();
        form.append(k, new Blob([blob], { type: v.type }), v.name);
      } else {
        // React Native accepte un objet { uri, name, type } comme fichier multipart.
        form.append(k, v as any);
      }
    }
    return form;
  }
}
