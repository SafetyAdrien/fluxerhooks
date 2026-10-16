import type { DraftMessage, Embed, EditorState } from '../types';
import { newEmbed, newMessage, newTarget, uid } from './factory';
import { hexToInt } from './parse';

const FLAG_SUPPRESS_EMBEDS = 1 << 2;
const FLAG_SUPPRESS_NOTIFICATIONS = 1 << 12;

const clean = (s: string | undefined | null) => (s ?? '').trim();

/** Convertit un embed de l'éditeur en « rich embed input » Fluxer (champs vides retirés). */
export function embedToApi(e: Embed): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (clean(e.title)) out.title = e.title;
  if (clean(e.url)) out.url = clean(e.url);
  if (clean(e.description)) out.description = e.description;
  if (e.color !== null) out.color = e.color;
  if (e.timestamp) out.timestamp = e.timestamp;
  if (clean(e.author.name)) {
    const a: Record<string, string> = { name: e.author.name };
    if (clean(e.author.url)) a.url = clean(e.author.url);
    if (clean(e.author.icon_url)) a.icon_url = clean(e.author.icon_url);
    out.author = a;
  }
  if (clean(e.thumbnail.url)) out.thumbnail = { url: clean(e.thumbnail.url) };
  if (clean(e.image.url)) out.image = { url: clean(e.image.url) };
  if (clean(e.footer.text)) {
    const f: Record<string, string> = { text: e.footer.text };
    if (clean(e.footer.icon_url)) f.icon_url = clean(e.footer.icon_url);
    out.footer = f;
  }
  const fields = e.fields
    .filter((f) => clean(f.name) || clean(f.value))
    .map((f) => ({ name: f.name || '​', value: f.value || '​', inline: f.inline }));
  if (fields.length) out.fields = fields;
  return out;
}

export function isEmbedEmpty(e: Embed): boolean {
  return Object.keys(embedToApi(e)).filter((k) => k !== 'color').length === 0;
}

export function allowedMentions(m: DraftMessage) {
  switch (m.mentions) {
    case 'all':
      return { parse: ['users', 'roles', 'everyone'] };
    case 'users':
      return { parse: ['users'] };
    case 'users_roles':
      return { parse: ['users', 'roles'] };
    default:
      return { parse: [] as string[] };
  }
}

/** Noms de fichiers cités en attachment:// par les embeds du message. */
export function referencedNames(m: DraftMessage): Set<string> {
  const out = new Set<string>();
  m.embeds.forEach((e) =>
    [e.image.url, e.thumbnail.url].forEach((u) => {
      const v = u.trim();
      if (v.startsWith('attachment://')) out.add(v.slice('attachment://'.length));
    }),
  );
  return out;
}

/**
 * Fichiers réellement envoyés : on retire ceux importés pour un embed
 * qui ne sont plus utilisés (image remplacée ou embed supprimé).
 */
export function effectiveAttachments(m: DraftMessage) {
  const refs = referencedNames(m);
  return m.attachments.filter((a) => !a.embedRef || refs.has(a.name));
}

/** Fichiers à afficher dans la liste « Fichiers » / sous le message (hors images d'embed). */
export function standaloneAttachments(m: DraftMessage) {
  const refs = referencedNames(m);
  return m.attachments.filter((a) => !a.embedRef && !refs.has(a.name));
}

/** Corps JSON envoyé à Execute webhook (sans fichiers, ajoutés en multipart). */
export function messageToPayload(m: DraftMessage, forEdit = false): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  p.content = m.content;
  p.embeds = m.embeds.filter((e) => !isEmbedEmpty(e)).map(embedToApi);
  let flags = 0;
  if (m.suppressEmbeds) flags |= FLAG_SUPPRESS_EMBEDS;
  if (m.suppressNotifications) flags |= FLAG_SUPPRESS_NOTIFICATIONS;
  p.flags = flags;
  p.allowed_mentions = allowedMentions(m);
  if (forEdit) return p;

  if (!clean(m.content)) delete p.content;
  if (clean(m.username)) p.username = clean(m.username);
  if (clean(m.avatar_url)) p.avatar_url = clean(m.avatar_url);
  if (m.threadMode === 'forum_post') {
    if (clean(m.thread_name)) p.thread_name = clean(m.thread_name);
    if (m.applied_tags.length) p.applied_tags = m.applied_tags;
  }
  if (clean(m.reply_to)) p.message_reference = { message_id: clean(m.reply_to), type: 0 };
  const files = effectiveAttachments(m);
  if (files.length) {
    p.attachments = files.map((a, i) => ({
      id: i,
      filename: a.spoiler && !a.name.startsWith('SPOILER_') ? `SPOILER_${a.name}` : a.name,
      ...(a.description ? { description: a.description } : {}),
      ...(a.spoiler ? { flags: 1 << 3 } : {}),
    }));
  }
  return p;
}

/* ---------- Import / export JSON ---------- */

function embedFromApi(raw: any): Embed {
  const e = newEmbed();
  if (!raw || typeof raw !== 'object') return e;
  e.title = raw.title ?? '';
  e.url = raw.url ?? '';
  e.description = raw.description ?? '';
  e.color = typeof raw.color === 'number' ? raw.color : typeof raw.color === 'string' ? hexToInt(raw.color) : null;
  e.timestamp = raw.timestamp ?? null;
  e.author = { name: raw.author?.name ?? '', url: raw.author?.url ?? '', icon_url: raw.author?.icon_url ?? '' };
  e.thumbnail = { url: raw.thumbnail?.url ?? '' };
  e.image = { url: raw.image?.url ?? '' };
  e.footer = { text: raw.footer?.text ?? '', icon_url: raw.footer?.icon_url ?? '' };
  e.fields = Array.isArray(raw.fields)
    ? raw.fields.map((f: any) => ({ id: uid(), name: f?.name ?? '', value: f?.value ?? '', inline: !!f?.inline }))
    : [];
  return e;
}

export function messageFromApi(raw: any, extra?: Partial<DraftMessage>): DraftMessage {
  const m = newMessage();
  if (raw && typeof raw === 'object') {
    m.content = raw.content ?? '';
    m.username = raw.username ?? raw.author?.username ?? '';
    m.avatar_url = raw.avatar_url ?? '';
    const embeds = Array.isArray(raw.embeds) ? raw.embeds : raw.embed ? [raw.embed] : [];
    m.embeds = embeds.filter((e: any) => !e?.type || e.type === 'rich').map(embedFromApi);
    const flags = typeof raw.flags === 'number' ? raw.flags : 0;
    m.suppressEmbeds = !!(flags & FLAG_SUPPRESS_EMBEDS);
    m.suppressNotifications = !!(flags & FLAG_SUPPRESS_NOTIFICATIONS);
    if (raw.thread_name) {
      m.threadMode = 'forum_post';
      m.thread_name = raw.thread_name;
      m.applied_tags = Array.isArray(raw.applied_tags) ? raw.applied_tags.map(String) : [];
    }
    if (raw.thread_id) {
      m.threadMode = 'thread';
      m.thread_id = String(raw.thread_id);
    }
  }
  return { ...m, ...extra };
}

/** Export : format FluxerHooks, compatible dans les deux sens avec le format de partage de Discohook. */
export function exportState(state: EditorState, includeTargets: boolean): string {
  return JSON.stringify(
    {
      version: 'fluxerhooks-1',
      ...(includeTargets ? { targets: state.targets.map((t) => ({ url: t.url })) } : {}),
      messages: state.messages.map((m) => ({
        data: {
          ...messageToPayload(m),
          ...(m.threadMode === 'thread' && m.thread_id ? { thread_id: m.thread_id } : {}),
          attachments: undefined,
          allowed_mentions: undefined,
        },
        ...(m.reference ? { reference: m.reference } : {}),
      })),
    },
    null,
    2,
  );
}

/** Import tolérant : format FluxerHooks/Discohook, payload brut, ou tableau de payloads. */
export function importState(text: string, current: EditorState): EditorState {
  const raw = JSON.parse(text);
  let list: any[] = [];
  let targets = current.targets;
  if (Array.isArray(raw)) list = raw.map((d) => ({ data: d }));
  else if (raw && Array.isArray(raw.messages)) {
    list = raw.messages.map((x: any) => (x && x.data ? x : { data: x }));
    if (Array.isArray(raw.targets) && raw.targets.length) {
      targets = raw.targets.filter((t: any) => t?.url).map((t: any) => newTarget(String(t.url)));
    }
  } else if (raw && typeof raw === 'object') list = [{ data: raw }];
  if (!list.length) throw new Error('Aucun message trouvé dans ce JSON.');
  return {
    targets: targets.length ? targets : [newTarget()],
    messages: list.map((x) => messageFromApi(x.data, x.reference ? { reference: String(x.reference) } : undefined)),
  };
}
