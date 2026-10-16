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
  /** Fichier importé pour une image d'embed : affiché dans l'embed, pas dans les fichiers du message. */
  embedRef?: { embedId: string; slot: 'image' | 'thumbnail' };
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
  /** Nom du serveur (destinations du bot). */
  guildName?: string;
  /** Destination « bot » : nom et avatar du bot, non personnalisables. */
  bot?: boolean;
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
  /** Zoom global de l'interface (texte, espacements, icônes) : 0.8 – 1.4. */
  zoom: number;
  wallpaper: WallpaperSettings;
  messageStyle: MessageStyle;
  /** Styles personnalisés façon CSS, une feuille par catégorie (voir theme/css.ts). */
  customCss: Record<string, string>;
  /** Variables de thème (--background-primary…) façon « Theme colors » de Fluxer. */
  themeVars: Record<string, string | number>;
  customCssEnabled: boolean;
  recentColors: number[];
}

export interface WallpaperSettings {
  uri: string | null;
  /** Assombrissement 0 – 0.9 (« DIM »). */
  dim: number;
  blur: number;
  /** Opacité des conteneurs posés sur le fond (0.55 – 1). */
  surfaceOpacity: number;
  /** Teinte de l'assombrissement : noir ou couleur d'accent. */
  tint: 'black' | 'accent';
}

export interface MessageStyle {
  avatarShape: 'circle' | 'rounded' | 'square';
  avatarSize: number;
  fontSize: number;
  showTimestamps: boolean;
  showBotTag: boolean;
  bubbles: boolean;
  spacing: 'tight' | 'normal' | 'airy';
  embedMaxWidth: number;
  embedBarWidth: number;
  groupMessages: boolean;
}

export interface Template {
  id: string;
  name: string;
  icon: string;
  description: string;
  builtin?: boolean;
  messages: DraftMessage[];
}

export type ScheduleKind = 'once' | 'interval' | 'daily' | 'weekly';

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  /** Source des messages : une sauvegarde ou un modèle. */
  source: { kind: 'backup' | 'template'; id: string };
  /** URL des webhooks visés (les cibles de la source sont utilisées si vide). */
  targets: string[];
  schedule: {
    kind: ScheduleKind;
    at: string; // ISO de la première exécution
    everyMinutes?: number; // interval
    weekdays?: number[]; // weekly : 0 = dimanche
  };
  nextRun: string | null;
  lastRun?: string;
  lastResult?: string;
  runs: number;
}

export interface FluxerUser {
  id: string;
  username: string;
  discriminator?: string;
  global_name?: string | null;
  avatar?: string | null;
  banner?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  accent_color?: number | null;
  email?: string | null;
  verified?: boolean;
  mfa_enabled?: boolean;
  premium_type?: number | null;
  premium_since?: string | null;
  bot?: boolean;
  flags?: number;
  [k: string]: unknown;
}

/** Réponse de GET /users/{id}/profile. */
export interface FluxerProfile {
  user: FluxerUser;
  user_profile: {
    bio: string | null;
    pronouns: string | null;
    banner: string | null;
    banner_color?: number | null;
    accent_color: number | null;
  };
  premium_type?: number;
  premium_since?: string;
  connected_accounts?: { id: string; type: string; name: string; verified: boolean }[];
  timezone_offset?: number | null;
  [k: string]: unknown;
}

export interface ApiRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

export interface ApiEmoji {
  id: string;
  name: string;
  animated?: boolean;
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
  guild_id?: string;
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
