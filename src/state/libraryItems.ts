import type { Backup, DraftMessage, EditorState, Folder, Template } from '../types';
import { cloneMessage, uid } from '../utils/factory';
import { importState } from '../utils/payload';
import { tr } from '../i18n';

/**
 * Vue unifiée des sauvegardes et des modèles pour la page Données : recherche, tri, filtres,
 * statistiques et fichiers d'export de la bibliothèque.
 */
export type ItemKind = 'backup' | 'template';

export interface LibraryItem {
  kind: ItemKind;
  id: string;
  /** Clé unique dans la liste (`backup:<id>`). */
  key: string;
  name: string;
  description: string;
  icon: string;
  createdAt: number;
  updatedAt: number;
  messages: DraftMessage[];
  targets: number;
  folder: string | null;
  tags: string[];
  pinned: boolean;
  builtin: boolean;
  /** Première ligne utile du contenu (texte ou titre d'embed). */
  excerpt: string;
  stats: { messages: number; embeds: number; files: number; chars: number };
}

export type SortKey = 'updated' | 'created' | 'name' | 'messages';
export type Scope = 'all' | 'backup' | 'template' | 'pinned';

export interface Filters {
  scope: Scope;
  /** Dossier : id, 'none' (non classés) ou null (tous). */
  folder: string | null;
  tag: string | null;
  query: string;
  sort: SortKey;
}

const time = (s?: string | null) => {
  const n = s ? Date.parse(s) : NaN;
  return isNaN(n) ? 0 : n;
};

function excerptOf(messages: DraftMessage[]): string {
  for (const m of messages) {
    const line = m.content.split('\n').map((l) => l.trim()).find(Boolean);
    if (line) return line.replace(/[*_~`>|#]+/g, '').trim().slice(0, 140);
    for (const e of m.embeds) {
      const t = (e.title || e.description || e.author.name || '').split('\n')[0].trim();
      if (t) return t.replace(/[*_~`>|#]+/g, '').trim().slice(0, 140);
    }
  }
  return '';
}

function statsOf(messages: DraftMessage[]) {
  let embeds = 0;
  let files = 0;
  let chars = 0;
  for (const m of messages) {
    embeds += m.embeds.length;
    files += m.attachments?.length ?? 0;
    chars += m.content.length;
    for (const e of m.embeds) chars += e.title.length + e.description.length + e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  }
  return { messages: messages.length, embeds, files, chars };
}

export function fromBackup(b: Backup): LibraryItem {
  const messages = b.state?.messages ?? [];
  return {
    kind: 'backup',
    id: b.id,
    key: `backup:${b.id}`,
    name: b.name,
    description: '',
    icon: 'archive-outline',
    createdAt: time(b.createdAt),
    updatedAt: time(b.updatedAt) || time(b.createdAt),
    messages,
    targets: (b.state?.targets ?? []).filter((t) => t.url.trim()).length,
    folder: b.folder ?? null,
    tags: b.tags ?? [],
    pinned: !!b.pinned,
    builtin: false,
    excerpt: excerptOf(messages),
    stats: statsOf(messages),
  };
}

export function fromTemplate(t: Template): LibraryItem {
  // Modèles intégrés : nom et description dans la langue de l'appli.
  const name = t.builtin ? tr(t.name) : t.name;
  const description = t.builtin ? tr(t.description ?? '') : t.description ?? '';
  return {
    kind: 'template',
    id: t.id,
    key: `template:${t.id}`,
    name,
    description,
    icon: t.icon || 'document-text-outline',
    createdAt: time(t.createdAt),
    updatedAt: time(t.updatedAt) || time(t.createdAt),
    messages: t.messages,
    targets: 0,
    folder: t.folder ?? null,
    tags: t.tags ?? [],
    pinned: !!t.pinned,
    builtin: !!t.builtin,
    excerpt: excerptOf(t.messages),
    stats: statsOf(t.messages),
  };
}

export function buildItems(backups: Backup[], templates: Template[]): LibraryItem[] {
  return [...backups.map(fromBackup), ...templates.map(fromTemplate)];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Texte cherché : nom, description, étiquettes, dossier et contenu des messages. */
function haystack(i: LibraryItem, folderName: string) {
  const parts = [i.name, i.description, folderName, ...i.tags];
  for (const m of i.messages) {
    parts.push(m.content, m.username);
    for (const e of m.embeds) parts.push(e.title, e.description, e.author.name, e.footer.text, ...e.fields.flatMap((f) => [f.name, f.value]));
  }
  return norm(parts.join(' \n '));
}

export function filterItems(items: LibraryItem[], f: Filters, folders: Folder[]): LibraryItem[] {
  const known = new Set(folders.map((x) => x.id));
  const names = new Map(folders.map((x) => [x.id, x.name]));
  const words = norm(f.query).split(/\s+/).filter(Boolean);
  const out = items.filter((i) => {
    if (f.scope === 'backup' && i.kind !== 'backup') return false;
    if (f.scope === 'template' && i.kind !== 'template') return false;
    if (f.scope === 'pinned' && !i.pinned) return false;
    const folder = i.folder && known.has(i.folder) ? i.folder : null;
    // « Non classés » : uniquement ce que l'utilisateur peut ranger (pas les modèles intégrés).
    if (f.folder === 'none' && (folder || i.builtin)) return false;
    if (f.folder && f.folder !== 'none' && folder !== f.folder) return false;
    if (f.tag && !i.tags.includes(f.tag)) return false;
    if (words.length) {
      const h = haystack(i, (folder && names.get(folder)) || '');
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  });
  const cmp: Record<SortKey, (a: LibraryItem, b: LibraryItem) => number> = {
    updated: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
    messages: (a, b) => b.stats.messages - a.stats.messages,
  };
  // Épinglés d'abord, modèles intégrés en dernier, puis le tri choisi.
  return out.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(a.builtin) - Number(b.builtin) || cmp[f.sort](a, b) || a.name.localeCompare(b.name));
}

/** Étiquettes utilisées, de la plus fréquente à la moins fréquente. */
export function allTags(items: LibraryItem[]): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) for (const t of i.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export const cleanTag = (s: string) => s.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 32);

/* ---------- Fichier d'export de la bibliothèque ---------- */

export const LIBRARY_FORMAT = 'fluxerhooks-library';

export interface LibraryFile {
  format: typeof LIBRARY_FORMAT;
  version: 1;
  exportedAt: string;
  backups: Backup[];
  templates: Template[];
  folders: Folder[];
}

export function exportLibrary(backups: Backup[], templates: Template[], folders: Folder[]): string {
  const used = new Set([...backups, ...templates].map((x) => x.folder).filter(Boolean) as string[]);
  const file: LibraryFile = {
    format: LIBRARY_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    backups,
    templates: templates.filter((t) => !t.builtin).map((t) => ({ ...t, builtin: undefined })),
    folders: folders.filter((f) => used.has(f.id)),
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Lit un fichier importé : bibliothèque FluxerHooks (sauvegardes, modèles, dossiers) ou JSON de
 * message (FluxerHooks / Discohook), qui devient une nouvelle sauvegarde.
 * Les éléments reçoivent de nouveaux identifiants : un import ne remplace jamais l'existant.
 */
export function importLibrary(text: string, current: EditorState, fileName = 'Import'): { backups: Backup[]; templates: Template[]; folders: Folder[] } {
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const now = new Date().toISOString();
  if (parsed && parsed.format === LIBRARY_FORMAT) {
    const folderIds = new Map<string, string>();
    const folders: Folder[] = (Array.isArray(parsed.folders) ? parsed.folders : [])
      .filter((f: any) => f && f.id && f.name)
      .map((f: any) => {
        const id = uid();
        folderIds.set(String(f.id), id);
        return { id, name: String(f.name).slice(0, 40), color: String(f.color || '#5865F2'), createdAt: f.createdAt || now };
      });
    const meta = (x: any) => ({
      folder: x.folder && folderIds.has(String(x.folder)) ? folderIds.get(String(x.folder))! : null,
      tags: Array.isArray(x.tags) ? x.tags.map((t: any) => cleanTag(String(t))).filter(Boolean) : [],
      pinned: !!x.pinned,
    });
    const backups: Backup[] = (Array.isArray(parsed.backups) ? parsed.backups : [])
      .filter((b: any) => b && b.state && Array.isArray(b.state.messages))
      .map((b: any) => ({ id: uid(), name: String(b.name || 'Sauvegarde'), createdAt: b.createdAt || now, updatedAt: now, state: b.state, ...meta(b) }));
    const templates: Template[] = (Array.isArray(parsed.templates) ? parsed.templates : [])
      .filter((t: any) => t && Array.isArray(t.messages))
      .map((t: any) => ({
        id: uid(),
        name: String(t.name || 'Modèle'),
        description: String(t.description || ''),
        icon: String(t.icon || 'document-text-outline'),
        createdAt: t.createdAt || now,
        updatedAt: now,
        messages: t.messages.map(cloneMessage),
        ...meta(t),
      }));
    if (!backups.length && !templates.length) throw new Error('Fichier vide');
    return { backups, templates, folders };
  }
  const state = importState(text, current);
  const name = fileName.replace(/\.json$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 60) || 'Import';
  return { backups: [{ id: uid(), name, createdAt: now, updatedAt: now, state }], templates: [], folders: [] };
}
