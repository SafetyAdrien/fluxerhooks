/** Extrait l'ID et le token d'une URL de webhook Fluxer (quel que soit l'hôte). */
export function parseWebhookUrl(url: string): { id: string; token: string } | null {
  const m = url.trim().match(/webhooks\/(\d{5,25})\/([A-Za-z0-9_\-]{10,})/);
  if (!m) return null;
  return { id: m[1], token: m[2] };
}

/**
 * Destination « bot » : le bot écrit lui-même dans le salon, sans webhook.
 * Encodée en chaîne `bot:<salon>` pour rester compatible avec les sauvegardes, exports et automatisations.
 */
export const BOT_PREFIX = 'bot:';
export const botTargetUrl = (channelId: string) => `${BOT_PREFIX}${channelId}`;
export function parseBotTarget(url: string): { channelId: string } | null {
  const m = url.trim().match(/^bot:(\d{5,25})$/);
  return m ? { channelId: m[1] } : null;
}
/** Webhook valide ou salon du bot. */
export const isSendableUrl = (url: string) => !!(parseWebhookUrl(url) || parseBotTarget(url));

/**
 * Accepte un ID de message brut ou un lien Fluxer
 * (…/channels/{guild}/{channel}/{message}) et renvoie l'ID du message.
 */
export function parseMessageRef(input: string): { messageId: string; channelId?: string } | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d{5,25}$/.test(s)) return { messageId: s };
  const m = s.match(/channels\/(?:\d+|@me)\/(\d+)\/(\d+)/);
  if (m) return { channelId: m[1], messageId: m[2] };
  return null;
}

export const isSnowflake = (s: string) => /^\d{5,25}$/.test(s.trim());

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s.trim());
}

export const isAttachmentRef = (s: string) => /^attachment:\/\/[^\s]+\.(png|jpe?g|webp|gif)$/i.test(s.trim());

/* Couleurs */
export function intToHex(n: number | null): string {
  if (n === null || n === undefined) return '';
  return '#' + n.toString(16).padStart(6, '0').toUpperCase();
}

export function hexToInt(hex: string): number | null {
  const h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) {
    return parseInt(h.split('').map((c) => c + c).join(''), 16);
  }
  if (/^[0-9a-f]{6}$/i.test(h)) return parseInt(h, 16);
  return null;
}

/** Mélange une couleur hex avec du blanc/noir (amount -1..1). */
export function shade(hex: string, amount: number): string {
  const n = hexToInt(hex) ?? 0;
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function withAlpha(hex: string, alpha: number): string {
  const n = hexToInt(hex) ?? 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Texte lisible (noir/blanc) sur un fond donné. */
export function readableOn(hex: string): string {
  const n = hexToInt(hex) ?? 0;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111214' : '#FFFFFF';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

export function formatTime(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Aujourd'hui à ${hm}`;
  return `${d.toLocaleDateString('fr-FR')} ${hm}`;
}
