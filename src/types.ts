// Modèles de données de l'éditeur, alignés sur l'API webhook de Fluxer
// (https://docs.fluxer.app/http-api/webhooks/ et /http-api/messages/).

export interface EmbedField {
  id: string;
  name: string;
  value: string;
  inline: boolean;
}

export interface Embed {
  id: string;
  title: string;
  url: string;
  description: string;
  color: number | null;
  timestamp: string | null; // ISO8601
  author: { name: string; url: string; icon_url: string };
  thumbnail: { url: string };
  image: { url: string };
  footer: { text: string; icon_url: string };
  fields: EmbedField[];
}

export interface LocalAttachment {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  spoiler: boolean;
  description: string;
}

export type MentionPolicy = 'none' | 'all' | 'users' | 'users_roles';

/** Où le message est envoyé : salon, thread existant, ou nouveau post de forum. */
export type ThreadMode = 'channel' | 'thread' | 'forum_post';

export interface DraftMessage {
  id: string;
  collapsed: boolean;
  content: string;
  username: string;
  avatar_url: string;
  embeds: Embed[];
  attachments: LocalAttachment[];
  suppressEmbeds: boolean;
  suppressNotifications: boolean;
  mentions: MentionPolicy;
  threadMode: ThreadMode;
  thread_id: string;
  thread_name: string;
  applied_tags: string[];
  /** Lien ou ID d'un message déjà envoyé par le webhook : on l'édite au lieu d'en créer un. */
  reference: string;
  /** Réponse à un message existant (ID). */
  reply_to: string;
  /** Résultat du dernier envoi. */
  lastSent?: { messageId: string; channelId: string; at: string };
}

export interface WebhookInfo {
  id: string;
  token: string;
  name: string;
  avatar: string | null;
  channel_id: string;
  guild_id: string;
  /** Renseignés si un token de bot est configuré (lecture du salon). */
  channelName?: string;
  channelType?: number;
  availableTags?: ApiForumTag[];
}

export interface WebhookTarget {
  id: string;
  url: string;
  enabled: boolean;
  info?: WebhookInfo;
  error?: string;
}

export interface EditorState {
  targets: WebhookTarget[];
  messages: DraftMessage[];
}

export interface Backup {
  id: string;
  name: string;
  createdAt: string;
  state: EditorState;
}

export type ThemeName = 'dark' | 'light' | 'amoled' | 'fluxer' | 'midnight' | 'system';

export interface AppSettings {
  theme: ThemeName;
  accent: string;
  fontScale: number; // 0.85 – 1.3
  radius: number; // 4 – 20
  density: 'compact' | 'comfortable';
  previewDisplay: 'cozy' | 'compact';
  splitView: 'auto' | 'off';
  confirmBeforeSend: boolean;
  haptics: boolean;
  autoCollapseSent: boolean;
  instance: string; // ex: https://fluxer.app
  showCounters: boolean;
}

/* Objets renvoyés par l'API */
export interface ApiGuild {
  id: string;
  name: string;
  icon: string | null;
}

export interface ApiForumTag {
  id: string;
  name: string;
  moderated: boolean;
  emoji_id: string | null;
  emoji_name: string | null;
}

export interface ApiChannel {
  id: string;
  type: number;
  name?: string;
  parent_id?: string | null;
  position?: number;
  available_tags?: ApiForumTag[];
  applied_tags?: string[];
  thread_metadata?: { archived: boolean; locked: boolean };
}

export interface ApiWebhook {
  id: string;
  name: string;
  avatar: string | null;
  channel_id: string;
  guild_id: string;
  token?: string;
  type: number;
}
