import type {
  ApiChannel,
  ApiGuild,
  ApiWebhook,
  DraftMessage,
  WebhookInfo,
} from '../types';
import { messageToPayload } from '../utils/payload';
import { parseMessageRef, parseWebhookUrl } from '../utils/parse';

/**
 * Client HTTP minimal pour l'API Fluxer.
 * Les URL de base sont découvertes via GET {instance}/.well-known/fluxer
 * (endpoints.api_public pour les bots et clients tiers), comme le recommande la doc.
 */

export interface Endpoints {
  api: string; // sans /v1
  media: string;
  webapp: string;
}

const DEFAULT_ENDPOINTS: Endpoints = {
  api: 'https://api.fluxer.app',
  media: 'https://fluxerusercontent.com',
  webapp: 'https://web.fluxer.app',
};

const cache = new Map<string, Endpoints>();

export class FluxerError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');

export async function resolveEndpoints(instance: string): Promise<Endpoints> {
  const origin = trimSlash(instance || 'https://fluxer.app');
  const hit = cache.get(origin);
  if (hit) return hit;
  try {
    const res = await fetch(`${origin}/.well-known/fluxer`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const ep: Endpoints = {
      api: trimSlash(json?.endpoints?.api_public || DEFAULT_ENDPOINTS.api),
      media: trimSlash(json?.endpoints?.media || DEFAULT_ENDPOINTS.media),
      webapp: trimSlash(json?.endpoints?.webapp || DEFAULT_ENDPOINTS.webapp),
    };
    cache.set(origin, ep);
    return ep;
  } catch {
    // Instance injoignable : on garde l'instance officielle comme repli.
    return DEFAULT_ENDPOINTS;
  }
}

export const clearEndpointCache = () => cache.clear();

const ERROR_FR: Record<string, string> = {
  UNKNOWN_WEBHOOK: 'Webhook introuvable (supprimé ou URL incorrecte).',
  CANNOT_SEND_EMPTY_MESSAGE: 'Le message est vide : ajoute du texte, un embed ou un fichier.',
  WEBHOOK_FORUM_TARGET_REQUIRED:
    'Ce webhook pointe vers un forum : choisis « Nouveau post » (avec un titre) ou « Thread existant ».',
  WEBHOOK_THREAD_NAME_REQUIRES_FORUM: 'Le titre de post n’est accepté que pour un webhook de salon forum/média.',
  UNKNOWN_MESSAGE: 'Message introuvable (mauvais ID, mauvais thread, ou pas envoyé par ce webhook).',
  UNKNOWN_FORUM_TAG: 'Un des tags sélectionnés n’existe pas dans ce forum.',
  FORUM_TAG_REQUIRED: 'Ce forum exige au moins un tag.',
  THREAD_LOCKED: 'Ce thread est verrouillé.',
  THREAD_ARCHIVED: 'Ce thread est archivé : impossible d’éditer ses messages.',
  CONTENT_BLOCKED: 'Contenu bloqué par les filtres de l’instance.',
  MISSING_PERMISSIONS: 'Permissions insuffisantes.',
  UNAUTHORIZED: 'Token invalide ou expiré.',
  INVALID_API_ORIGIN: 'Origine refusée par Fluxer.',
  MAX_WEBHOOKS_PER_CHANNEL: 'Ce salon a atteint son nombre maximum de webhooks.',
  TOO_MANY_EMBEDS: 'Trop d’embeds dans ce message.',
  FILE_SIZE_TOO_LARGE: 'Fichier trop volumineux.',
};

function describe(json: any, status: number): string {
  const code: string | undefined = json?.code;
  if (code && ERROR_FR[code]) return ERROR_FR[code];
  let msg = json?.message || `Erreur HTTP ${status}`;
  // Détails de validation éventuels (INVALID_FORM_BODY)
  const errs = json?.errors;
  if (errs && typeof errs === 'object') {
    const parts: string[] = [];
    const walk = (o: any, path: string) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o._errors)) o._errors.forEach((e: any) => parts.push(`${path}: ${e.code || e.message}`));
      if (o.code && o.message && path) parts.push(`${path}: ${o.code}`);
      Object.keys(o).forEach((k) => k !== '_errors' && walk(o[k], path ? `${path}.${k}` : k));
    };
    walk(errs, '');
    if (parts.length) msg += '\n' + parts.slice(0, 4).join('\n');
  }
  return code ? `${msg} (${code})` : msg;
}

interface ReqOpts {
  method?: string;
  bot?: string; // token de bot
  json?: unknown;
  form?: FormData;
  query?: Record<string, string | undefined>;
}

async function request<T>(ep: Endpoints, path: string, opts: ReqOpts = {}, attempt = 0): Promise<T> {
  const q = opts.query
    ? Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
        .join('&')
    : '';
  const url = `${ep.api}/v1${path}${q ? `?${q}` : ''}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.bot) headers.Authorization = `Bot ${opts.bot}`;
  let body: any;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(url, { method: opts.method || 'GET', headers, body });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (res.status === 429 && attempt < 3) {
    const wait = Math.min(Number(json?.retry_after ?? res.headers.get('retry-after') ?? 1), 10);
    await new Promise((r) => setTimeout(r, wait * 1000 + 100));
    return request<T>(ep, path, opts, attempt + 1);
  }
  if (!res.ok) throw new FluxerError(describe(json, res.status), res.status, json?.code);
  return json as T;
}

/* ---------- Webhooks (authentifiés par l'URL) ---------- */

export async function getWebhook(ep: Endpoints, url: string): Promise<WebhookInfo> {
  const p = parseWebhookUrl(url);
  if (!p) throw new FluxerError('URL de webhook invalide.', 0);
  const w = await request<ApiWebhook>(ep, `/webhooks/${p.id}/${p.token}`);
  return { id: w.id, token: p.token, name: w.name, avatar: w.avatar, channel_id: w.channel_id, guild_id: w.guild_id };
}

function buildBody(m: DraftMessage, forEdit: boolean): { json?: unknown; form?: FormData } {
  const payload = messageToPayload(m, forEdit);
  if (forEdit || !m.attachments.length) return { json: payload };
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  m.attachments.forEach((a, i) => {
    const name = a.spoiler && !a.name.startsWith('SPOILER_') ? `SPOILER_${a.name}` : a.name;
    // React Native accepte un objet { uri, name, type } comme fichier multipart.
    form.append(`files[${i}]`, { uri: a.uri, name, type: a.mimeType || 'application/octet-stream' } as any);
  });
  return { form };
}

export interface SentMessage {
  id: string;
  channel_id: string;
}

/** Envoie (ou édite si `reference` est renseigné) un message via le webhook. */
export async function sendMessage(ep: Endpoints, url: string, m: DraftMessage): Promise<SentMessage & { edited: boolean }> {
  const p = parseWebhookUrl(url);
  if (!p) throw new FluxerError('URL de webhook invalide.', 0);
  const threadId = m.threadMode === 'thread' && m.thread_id.trim() ? m.thread_id.trim() : undefined;
  const ref = parseMessageRef(m.reference);
  if (m.reference.trim() && !ref) throw new FluxerError('Lien ou ID du message à éditer invalide.', 0);
  if (ref) {
    const msg = await request<SentMessage>(ep, `/webhooks/${p.id}/${p.token}/messages/${ref.messageId}`, {
      method: 'PATCH',
      query: { thread_id: threadId },
      ...buildBody(m, true),
    });
    return { ...msg, edited: true };
  }
  if (m.threadMode === 'forum_post' && !m.thread_name.trim()) {
    throw new FluxerError('Donne un titre au nouveau post de forum.', 0);
  }
  const msg = await request<SentMessage>(ep, `/webhooks/${p.id}/${p.token}`, {
    method: 'POST',
    query: { wait: 'true', thread_id: threadId },
    ...buildBody(m, false),
  });
  return { ...msg, edited: false };
}

export async function fetchWebhookMessage(ep: Endpoints, url: string, ref: string, threadId?: string): Promise<any> {
  const p = parseWebhookUrl(url);
  const r = parseMessageRef(ref);
  if (!p || !r) throw new FluxerError('URL du webhook ou lien du message invalide.', 0);
  return request<any>(ep, `/webhooks/${p.id}/${p.token}/messages/${r.messageId}`, { query: { thread_id: threadId } });
}

export async function deleteWebhookMessage(ep: Endpoints, url: string, ref: string, threadId?: string): Promise<void> {
  const p = parseWebhookUrl(url);
  const r = parseMessageRef(ref);
  if (!p || !r) throw new FluxerError('URL du webhook ou lien du message invalide.', 0);
  await request<void>(ep, `/webhooks/${p.id}/${p.token}/messages/${r.messageId}`, {
    method: 'DELETE',
    query: { thread_id: threadId },
  });
}

export async function updateWebhookWithToken(
  ep: Endpoints,
  url: string,
  body: { name?: string; avatar?: string | null },
): Promise<ApiWebhook> {
  const p = parseWebhookUrl(url);
  if (!p) throw new FluxerError('URL de webhook invalide.', 0);
  return request<ApiWebhook>(ep, `/webhooks/${p.id}/${p.token}`, { method: 'PATCH', json: body });
}

/* ---------- Compte bot (Authorization: Bot <token>) ---------- */

export const bot = {
  me: (ep: Endpoints, token: string) => request<{ id: string; username: string; avatar: string | null }>(ep, '/users/@me', { bot: token }),
  guilds: (ep: Endpoints, token: string) => request<ApiGuild[]>(ep, '/users/@me/guilds', { bot: token, query: { limit: '200' } }),
  channels: (ep: Endpoints, token: string, guildId: string) =>
    request<ApiChannel[]>(ep, `/guilds/${guildId}/channels`, { bot: token }),
  channel: (ep: Endpoints, token: string, channelId: string) => request<ApiChannel>(ep, `/channels/${channelId}`, { bot: token }),
  activeThreads: (ep: Endpoints, token: string, guildId: string) =>
    request<{ threads: ApiChannel[] }>(ep, `/guilds/${guildId}/threads/active`, { bot: token }),
  archivedThreads: (ep: Endpoints, token: string, channelId: string) =>
    request<{ threads: ApiChannel[] }>(ep, `/channels/${channelId}/threads/archived/public`, { bot: token, query: { limit: '50' } }),
  webhooks: (ep: Endpoints, token: string, channelId: string) =>
    request<ApiWebhook[]>(ep, `/channels/${channelId}/webhooks`, { bot: token }),
  createWebhook: (ep: Endpoints, token: string, channelId: string, name: string) =>
    request<ApiWebhook>(ep, `/channels/${channelId}/webhooks`, { bot: token, method: 'POST', json: { name } }),
};

/* ---------- Médias ---------- */

export const webhookUrlOf = (ep: Endpoints, w: { id: string; token?: string }) =>
  `${ep.api}/webhooks/${w.id}/${w.token}`;

export const avatarUrl = (ep: Endpoints, id: string, hash: string | null | undefined, size = 128) =>
  hash ? `${ep.media}/avatars/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=${size}` : null;

export const guildIconUrl = (ep: Endpoints, id: string, hash: string | null | undefined, size = 96) =>
  hash ? `${ep.media}/icons/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=${size}` : null;

export const messageLink = (ep: Endpoints, guildId: string, channelId: string, messageId: string) =>
  `${ep.webapp}/channels/${guildId}/${channelId}/${messageId}`;

/** Types de salons Fluxer (doc « Channel types »). */
export const CHANNEL_TYPES = {
  TEXT: 0,
  VOICE: 2,
  CATEGORY: 4,
  ANNOUNCEMENT: 5,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  FORUM: 15,
  MEDIA: 16,
} as const;

export const WEBHOOK_CHANNEL_TYPES: number[] = [0, 2, 5, 15, 16];
export const isForumType = (t: number) => t === 15 || t === 16;
export const isThreadType = (t: number) => t === 10 || t === 11 || t === 12;
