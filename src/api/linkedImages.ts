import { downloadImage, imageExtension } from '../platform/files';
import { LIMITS } from '../utils/limits';
import type { DraftMessage, LocalAttachment } from '../types';
import { uid } from '../utils/factory';

/**
 * Images d'embed données par un lien : Fluxer n'affiche l'image d'un embed que s'il en connaît les
 * dimensions, qu'il obtient en allant lui-même chercher le lien. Quand le site refuse ses serveurs
 * (protection anti-hotlink, page au lieu d'une image, lien expiré…), l'image n'apparaît pas et un
 * embed qui ne contenait qu'elle donne un message vide. Avant l'envoi, l'appareil télécharge donc
 * l'image et la joint au message (attachment://), comme une image importée : Fluxer en connaît alors
 * toujours les dimensions. Si le téléchargement échoue, le lien est envoyé tel quel.
 */

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;
// Téléchargements récents réutilisés (plusieurs destinations, envois rapprochés).
const cache = new Map<string, { at: number; file: { uri: string; mimeType: string; size: number } | null }>();
const CACHE_MS = 5 * 60_000;

async function fetchCached(url: string) {
  const c = cache.get(url);
  if (c && Date.now() - c.at < CACHE_MS) return c.file;
  const file = await downloadImage(url, MAX_IMAGE);
  cache.set(url, { at: Date.now(), file });
  return file;
}

const isLink = (u: string) => /^https?:\/\//i.test(u.trim());

/** Message prêt à l'envoi : liens d'images d'embed remplacés par des fichiers joints quand c'est possible. */
export async function inlineLinkedImages(m: DraftMessage, skipHosts: string[] = []): Promise<DraftMessage> {
  const slots: { ei: number; slot: 'image' | 'thumbnail'; url: string }[] = [];
  m.embeds.forEach((e, ei) => {
    for (const slot of ['image', 'thumbnail'] as const) {
      const url = (slot === 'image' ? e.image.url : e.thumbnail.url).trim();
      if (!isLink(url)) continue;
      let host = '';
      try {
        host = new URL(url).host;
      } catch {
        continue;
      }
      if (skipHosts.includes(host)) continue;
      slots.push({ ei, slot, url });
    }
  });
  if (!slots.length) return m;
  const files = await Promise.all(slots.map((s) => fetchCached(s.url)));
  const embeds = m.embeds.map((e) => ({ ...e, image: { ...e.image }, thumbnail: { ...e.thumbnail } }));
  const attachments: LocalAttachment[] = [...m.attachments];
  let total = attachments.reduce((n, a) => n + (a.size || 0), 0);
  slots.forEach((s, i) => {
    const f = files[i];
    const ext = f && imageExtension(f.mimeType);
    if (!f || !ext || attachments.length >= LIMITS.attachments || total + f.size > MAX_TOTAL) return;
    const e = embeds[s.ei];
    const name = `link-${s.slot}-${e.id.slice(-6)}-${i}.${ext}`;
    attachments.push({ id: uid(), uri: f.uri, name, mimeType: f.mimeType, size: f.size, spoiler: false, description: '', embedRef: { embedId: e.id, slot: s.slot } });
    total += f.size;
    if (s.slot === 'image') e.image.url = `attachment://${name}`;
    else e.thumbnail.url = `attachment://${name}`;
  });
  return { ...m, embeds, attachments };
}
