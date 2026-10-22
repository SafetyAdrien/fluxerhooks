import { UploadForm } from '../platform/files';
import type {
  FluxerProfile,
  ApiChannel,
  ApiEmoji,
  ApiGuild,
  ApiRole,
  ApiWebhook,
  FluxerUser,
  DraftMessage,
  WebhookInfo,
} from '../types';
import { effectiveAttachments, messageToPayload } from '../utils/payload';
import { parseBotTarget, parseMessageRef, parseWebhookUrl } from '../utils/parse';

/**
 * Client HTTP minimal pour l'API Fluxer.
 * Les URL de base sont découvertes via GET {instance}/.well-known/fluxer
 * (endpoints.api_public pour les bots et clients tiers), comme le recommande la doc.
 */

export interface Endpoints {
  api: string; // sans /v1
  media: string;
  webapp: string;
  /** WebSocket du gateway principal (bots en ligne). */
  gateway: string;
}

const DEFAULT_ENDPOINTS: Endpoints = {
  api: 'https://api.fluxer.app',
  media: 'https://fluxerusercontent.com',
  webapp: 'https://web.fluxer.app',
  gateway: 'wss://gateway.fluxer.app',
};

const cache = new Map<string, Endpoints>();

export class FluxerError extends Error {
  status: number;
  code?: string;
  body?: any;
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(`${origin}/.well-known/fluxer`, { headers: { Accept: 'application/json' }, signal: ctrl.signal }).finally(() =>
      clearTimeout(timer),
    );
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const ep: Endpoints = {
      api: trimSlash(json?.endpoints?.api_public || DEFAULT_ENDPOINTS.api),
      media: trimSlash(json?.endpoints?.media || DEFAULT_ENDPOINTS.media),
      webapp: trimSlash(json?.endpoints?.webapp || DEFAULT_ENDPOINTS.webapp),
      gateway: trimSlash(json?.endpoints?.gateway || DEFAULT_ENDPOINTS.gateway),
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
  ACCOUNT_SUSPENDED_TEMPORARILY: 'Ce compte est temporairement suspendu.',
  ACCOUNT_SUSPENDED_PERMANENTLY: 'Ce compte est suspendu.',
  INVALID_CAPTCHA: 'La vérification anti-robot a été refusée, réessaie.',
  INVALID_API_ORIGIN: 'Origine refusée par Fluxer.',
  MAX_WEBHOOKS_PER_CHANNEL: 'Ce salon a atteint son nombre maximum de webhooks.',
  TOO_MANY_EMBEDS: 'Trop d’embeds dans ce message.',
  FILE_SIZE_TOO_LARGE: 'Fichier trop volumineux.',
};

function describe(json: any, status: number): string {
  const code: string | undefined = json?.code;
  if (code && ERROR_FR[code]) return ERROR_FR[code];
  // Codes de validation imbriqués (INVALID_FORM_BODY) les plus courants à la connexion.
  const raw = JSON.stringify(json?.errors ?? '');
  if (raw.includes('INVALID_EMAIL_OR_PASSWORD')) return 'E-mail ou mot de passe incorrect.';
  if (raw.includes('INVALID_CODE')) return 'Code de double authentification incorrect.';
  if (raw.includes('SESSION_TIMEOUT')) return 'La session de connexion a expiré, recommence.';
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
  user?: string; // token de session utilisateur
  headers?: Record<string, string>;
  timeoutMs?: number;
  json?: unknown;
  form?: UploadForm;
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
  if (opts.user) {
    // Un token de session s'envoie sans préfixe ; channel_threads donne accès aux threads et forums.
    headers.Authorization = opts.user;
    headers['X-Fluxer-Features'] = 'channel_threads';
  }
  if (opts.headers) Object.assign(headers, opts.headers);
  let body: any;
  if (opts.form) body = await opts.form.build();
  else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  // Délai maximal : une requête bloquée ne doit jamais laisser un chargement infini.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method || 'GET', headers, body, signal: ctrl.signal });
  } catch (e) {
    throw new FluxerError(
      ctrl.signal.aborted ? 'Le serveur Fluxer ne répond pas (délai dépassé). Vérifie ta connexion et réessaie.' : 'Connexion impossible au serveur Fluxer. Vérifie ta connexion Internet.',
      0,
      ctrl.signal.aborted ? 'TIMEOUT' : 'NETWORK',
    );
  } finally {
    clearTimeout(timer);
  }
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
  if (!res.ok) {
    const err = new FluxerError(describe(json, res.status), res.status, json?.code);
    err.body = json;
    throw err;
  }
  return json as T;
}

/* ---------- Webhooks (authentifiés par l'URL) ---------- */

export async function getWebhook(ep: Endpoints, url: string): Promise<WebhookInfo> {
  const p = parseWebhookUrl(url);
  if (!p) throw new FluxerError('URL de webhook invalide.', 0);
  const w = await request<ApiWebhook>(ep, `/webhooks/${p.id}/${p.token}`);
  return { id: w.id, token: p.token, name: w.name, avatar: w.avatar, channel_id: w.channel_id, guild_id: w.guild_id };
}

function buildBody(m: DraftMessage, forEdit: boolean): { json?: unknown; form?: UploadForm } {
  const payload = messageToPayload(m, forEdit);
  const files = effectiveAttachments(m);
  if (forEdit || !files.length) return { json: payload };
  const form = new UploadForm();
  form.append('payload_json', JSON.stringify(payload));
  files.forEach((a, i) => {
    const name = a.spoiler && !a.name.startsWith('SPOILER_') ? `SPOILER_${a.name}` : a.name;
    form.append(`files[${i}]`, { uri: a.uri, name, type: a.mimeType || 'application/octet-stream' });
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

/* ---------- Envoi direct par le bot (sans webhook) ---------- */

/** Corps d'un message de bot : pas de nom/avatar personnalisés ni de champs propres aux webhooks. */
function botPayload(m: DraftMessage, forEdit: boolean): Record<string, unknown> {
  const p = messageToPayload(m, forEdit);
  delete p.username;
  delete p.avatar_url;
  delete p.thread_name;
  delete p.applied_tags;
  return p;
}

function botBody(m: DraftMessage, forEdit: boolean, wrap?: (p: Record<string, unknown>) => Record<string, unknown>) {
  const payload = botPayload(m, forEdit);
  const json = wrap ? wrap(payload) : payload;
  const files = effectiveAttachments(m);
  if (forEdit || !files.length) return { json };
  const form = new UploadForm();
  form.append('payload_json', JSON.stringify(json));
  files.forEach((a, i) => {
    const name = a.spoiler && !a.name.startsWith('SPOILER_') ? `SPOILER_${a.name}` : a.name;
    form.append(`files[${i}]`, { uri: a.uri, name, type: a.mimeType || 'application/octet-stream' });
  });
  return { form };
}

/** Salon réellement visé par un message de bot (thread choisi, ou salon du lien de référence). */
function botChannelFor(channelId: string, m: DraftMessage, refChannel?: string) {
  if (refChannel) return refChannel;
  if (m.threadMode === 'thread' && m.thread_id.trim()) return m.thread_id.trim();
  return channelId;
}

/**
 * Le bot envoie lui-même le message : salon texte, thread, ou nouveau post de forum
 * (POST /channels/{forum}/threads avec le premier message). Édite si `reference` est renseigné.
 */
export async function sendBotMessage(
  ep: Endpoints,
  token: string,
  channelId: string,
  m: DraftMessage,
  channelType?: number,
): Promise<SentMessage & { edited: boolean }> {
  const ref = parseMessageRef(m.reference);
  if (m.reference.trim() && !ref) throw new FluxerError('Lien ou ID du message à éditer invalide.', 0);
  if (ref) {
    const ch = botChannelFor(channelId, m, ref.channelId);
    const msg = await request<SentMessage>(ep, `/channels/${ch}/messages/${ref.messageId}`, { method: 'PATCH', bot: token, ...botBody(m, true) });
    return { ...msg, edited: true };
  }
  const forum = m.threadMode === 'forum_post' || (channelType !== undefined && isForumType(channelType) && m.threadMode !== 'thread');
  if (forum) {
    if (!m.thread_name.trim()) throw new FluxerError('Donne un titre au nouveau post de forum.', 0);
    const { message_reference: _r, ...first } = botPayload(m, false);
    const res = await request<{ id: string; message?: SentMessage }>(ep, `/channels/${channelId}/threads`, {
      method: 'POST',
      bot: token,
      ...botBody(m, false, () => ({
        name: m.thread_name.trim(),
        ...(m.applied_tags.length ? { applied_tags: m.applied_tags } : {}),
        message: first,
      })),
    });
    return { id: res.message?.id ?? res.id, channel_id: res.id, edited: false };
  }
  const ch = botChannelFor(channelId, m);
  const msg = await request<SentMessage>(ep, `/channels/${ch}/messages`, { method: 'POST', bot: token, ...botBody(m, false) });
  return { ...msg, edited: false };
}

/** Envoie vers une destination quelconque : URL de webhook ou `bot:<salon>`. */
export async function sendToTarget(
  ep: Endpoints,
  url: string,
  m: DraftMessage,
  botToken?: string,
  channelType?: number,
): Promise<SentMessage & { edited: boolean }> {
  const bot = parseBotTarget(url);
  if (!bot) return sendMessage(ep, url, m);
  if (!botToken) throw new FluxerError('Aucun token de bot enregistré : ajoute-le dans la carte « Bot Fluxer ».', 0);
  return sendBotMessage(ep, botToken, bot.channelId, m, channelType);
}

export async function fetchTargetMessage(ep: Endpoints, url: string, m: DraftMessage, botToken?: string): Promise<any> {
  const bot = parseBotTarget(url);
  if (!bot) return fetchWebhookMessage(ep, url, m.reference, m.threadMode === 'thread' ? m.thread_id : undefined);
  const r = parseMessageRef(m.reference);
  if (!r) throw new FluxerError('Lien ou ID du message invalide.', 0);
  return request<any>(ep, `/channels/${botChannelFor(bot.channelId, m, r.channelId)}/messages/${r.messageId}`, { bot: botToken });
}

export async function deleteTargetMessage(ep: Endpoints, url: string, m: DraftMessage, ref: string, botToken?: string): Promise<void> {
  const bot = parseBotTarget(url);
  if (!bot) return deleteWebhookMessage(ep, url, ref, m.threadMode === 'thread' ? m.thread_id : undefined);
  const r = parseMessageRef(ref);
  if (!r) throw new FluxerError('Lien ou ID du message invalide.', 0);
  await request<void>(ep, `/channels/${botChannelFor(bot.channelId, m, r.channelId)}/messages/${r.messageId}`, { method: 'DELETE', bot: botToken });
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

/* ---------- Client générique : bot OU compte utilisateur ---------- */

export type Credential = { kind: 'bot' | 'user'; token: string };

const auth = (c: Credential): Partial<ReqOpts> => (c.kind === 'bot' ? { bot: c.token } : { user: c.token });

export function apiFor(ep: Endpoints, c: Credential) {
  const a = auth(c);
  return {
    me: () => request<FluxerUser>(ep, '/users/@me', a),
    /** URL du gateway pour un bot (GET /gateway/bot). */
    gatewayBot: () => request<{ url: string; shards?: number }>(ep, '/gateway/bot', a),
    /** Tous les webhooks du serveur (permission « Gérer les webhooks »). */
    guildWebhooks: (guildId: string) => request<ApiWebhook[]>(ep, `/guilds/${guildId}/webhooks`, a),
    /** Profil complet (bio, pronoms, bannière, connexions…) : GET /users/{id}/profile. */
    profile: (userId: string) => request<FluxerProfile>(ep, `/users/${userId}/profile`, a),
    guilds: () => request<ApiGuild[]>(ep, '/users/@me/guilds', { ...a, query: { limit: '200', with_counts: 'true' } }),
    channels: (guildId: string) => request<ApiChannel[]>(ep, `/guilds/${guildId}/channels`, a),
    channel: (channelId: string) => request<ApiChannel>(ep, `/channels/${channelId}`, a),
    roles: (guildId: string) => request<ApiRole[]>(ep, `/guilds/${guildId}/roles`, a),
    emojis: (guildId: string) => request<ApiEmoji[]>(ep, `/guilds/${guildId}/emojis`, a),
    activeThreads: async (guildId: string, channels: ApiChannel[]): Promise<ApiChannel[]> => {
      if (c.kind === 'bot') {
        const r = await request<{ threads: ApiChannel[] }>(ep, `/guilds/${guildId}/threads/active`, a).catch(() => ({ threads: [] }));
        return r.threads ?? [];
      }
      // Pour un compte utilisateur, l'API ne liste pas les threads actifs du serveur :
      // on interroge la recherche de threads des salons forum (et texte) concernés.
      const parents = channels.filter((x) => [0, 5, 15, 16].includes(x.type)).slice(0, 25);
      const lists = await Promise.all(
        parents.map((p) =>
          request<{ threads: ApiChannel[] }>(ep, `/channels/${p.id}/threads/search`, { ...a, query: { archived: 'false', limit: '25' } })
            .then((r) => r.threads ?? [])
            .catch(() => [] as ApiChannel[]),
        ),
      );
      return lists.flat();
    },
    archivedThreads: (channelId: string) =>
      request<{ threads: ApiChannel[] }>(ep, `/channels/${channelId}/threads/archived/public`, { ...a, query: { limit: '50' } }).then((r) => r.threads ?? []),
    webhooks: (channelId: string) => request<ApiWebhook[]>(ep, `/channels/${channelId}/webhooks`, a),
    createWebhook: (channelId: string, name: string) =>
      request<ApiWebhook>(ep, `/channels/${channelId}/webhooks`, { ...a, method: 'POST', json: { name } }),
    /* Systèmes du bot : messages simples, réactions et rôles des membres. */
    message: (channelId: string, messageId: string) => request<any>(ep, `/channels/${channelId}/messages/${messageId}`, a),
    sendText: (channelId: string, content: string, mentions: 'users' | 'none' = 'users') =>
      request<{ id: string; channel_id: string }>(ep, `/channels/${channelId}/messages`, {
        ...a,
        method: 'POST',
        json: { content, allowed_mentions: { parse: mentions === 'users' ? ['users'] : [] } },
      }),
    editText: (channelId: string, messageId: string, content: string) =>
      request<any>(ep, `/channels/${channelId}/messages/${messageId}`, { ...a, method: 'PATCH', json: { content, allowed_mentions: { parse: [] } } }),
    /** Réaction du compte (émoji Unicode, ou « nom:id » pour un émoji du serveur). */
    addReaction: (channelId: string, messageId: string, emoji: string) =>
      request<void>(ep, `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, { ...a, method: 'PUT' }),
    addRole: (guildId: string, userId: string, roleId: string) =>
      request<void>(ep, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { ...a, method: 'PUT' }),
    removeRole: (guildId: string, userId: string, roleId: string) =>
      request<void>(ep, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, { ...a, method: 'DELETE' }),
  };
}

/* ---------- Connexion à un compte Fluxer ---------- */

export interface LoginResult {
  token?: string;
  user?: FluxerUser;
  mfa?: { ticket: string; methods: string[] };
}

/** POST /v1/auth/login ; gère CAPTCHA_REQUIRED via le callback `solve`. */
export async function loginWithPassword(
  ep: Endpoints,
  login: string,
  password: string,
  solve: (challenge: any) => Promise<string>,
  presolved?: string,
): Promise<LoginResult> {
  let captcha: string | undefined = presolved;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await request<any>(ep, '/auth/login', {
        method: 'POST',
        json: login.includes('@') ? { email: login.trim(), password } : { login: login.trim(), password },
        headers: captcha ? { 'X-Captcha-Token': captcha } : undefined,
      });
      if (r?.mfa) return { mfa: { ticket: r.ticket, methods: r.allowed_methods ?? [] } };
      return { token: r.token, user: r.user };
    } catch (e) {
      const fe = e as FluxerError;
      if ((fe.code === 'CAPTCHA_REQUIRED' || fe.code === 'INVALID_CAPTCHA') && fe.body?.altcha_challenge) {
        captcha = await solve(fe.body.altcha_challenge);
        continue;
      }
      if (fe.code === 'IP_AUTHORIZATION_REQUIRED') {
        throw new FluxerError(
          `Nouvelle adresse IP : Fluxer t’a envoyé un e-mail${fe.body?.email ? ` (${fe.body.email})` : ''}. Valide la connexion depuis cet e-mail, puis appuie de nouveau sur « Se connecter ».`,
          403,
          fe.code,
        );
      }
      throw e;
    }
  }
  throw new FluxerError('Échec du CAPTCHA, réessaie.', 400, 'INVALID_CAPTCHA');
}

/**
 * Récupère un défi ALTCHA de connexion sans envoyer d'identifiants : le middleware CAPTCHA
 * de Fluxer passe avant la validation du corps, il répond donc CAPTCHA_REQUIRED + défi.
 * Renvoie null si l'instance n'exige pas de CAPTCHA.
 */
export async function fetchLoginChallenge(ep: Endpoints): Promise<any | null> {
  try {
    await request<any>(ep, '/auth/login', { method: 'POST', json: {} });
    return null;
  } catch (e) {
    const fe = e as FluxerError;
    if (fe.body?.altcha_challenge) return fe.body.altcha_challenge;
    if (fe.status === 400 && fe.code !== 'CAPTCHA_REQUIRED' && fe.code !== 'INVALID_CAPTCHA') return null;
    throw e;
  }
}

export async function loginMfaTotp(ep: Endpoints, ticket: string, code: string): Promise<LoginResult> {
  const r = await request<any>(ep, '/auth/login/mfa/totp', { method: 'POST', json: { ticket, code: code.replace(/\s/g, '') } });
  return { token: r.token, user: r.user };
}

export const logout = (ep: Endpoints, token: string) =>
  request<void>(ep, '/auth/logout', { method: 'POST', user: token }).catch(() => undefined);

/* ---------- Médias ---------- */

export const webhookUrlOf = (ep: Endpoints, w: { id: string; token?: string }) =>
  `${ep.api}/webhooks/${w.id}/${w.token}`;

export const avatarUrl = (ep: Endpoints, id: string, hash: string | null | undefined, size = 128) =>
  hash ? `${ep.media}/avatars/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=${size}` : null;

export const bannerUrl = (ep: Endpoints, id: string, hash: string | null | undefined, size = 600) =>
  hash ? `${ep.media}/banners/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=${size}` : null;

export const emojiUrl = (ep: Endpoints, id: string, animated?: boolean, size = 96) =>
  `${ep.media}/emojis/${id}.webp?size=${size}${animated ? '&animated=true' : ''}`;

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

/* ---------- Sessions du compte (appareils connectés) ---------- */

export interface AuthSession {
  id_hash: string;
  current: boolean;
  client_info?: {
    platform?: string | null;
    os?: string | null;
    browser?: string | null;
    device?: string | null;
    location?: { city?: string | null; region?: string | null; country?: string | null } | null;
  } | null;
  masked_ip?: string | null;
  approx_last_used_at?: string | null;
}

/** GET /v1/auth/sessions : appareils connectés au compte, du plus récemment actif au plus ancien. */
export const listAuthSessions = (ep: Endpoints, token: string) => request<AuthSession[]>(ep, '/auth/sessions', { user: token });
