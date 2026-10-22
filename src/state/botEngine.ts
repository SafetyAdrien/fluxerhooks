import type { BotSystem, MemberMessageSystem, ReactionEmoji, ReactionRoleSystem } from '../types';

/**
 * Moteur des systèmes du bot : à partir d'un événement du gateway Fluxer (réaction ajoutée ou
 * retirée, membre arrivé ou parti), calcule les actions à faire (donner / retirer un rôle,
 * envoyer un message). Le même calcul existe dans le service Android (BotGatewayService.kt),
 * qui reçoit ces règles sous forme compacte (`compileRules`) pour fonctionner app fermée.
 */

export const BOT_SYSTEMS_KEY = 'fluxerhooks:botsystems:v1';

/** Clé de comparaison d'un émoji (les sélecteurs de variante U+FE0F sont ignorés). */
export const emojiKey = (e: { name?: string | null; id?: string | null }) => (e.id ? `id:${e.id}` : `u:${(e.name ?? '').replace(/️/g, '')}`);

/** Valeur de l'émoji dans l'URL d'une réaction (non encodée). */
export const emojiParam = (e: ReactionEmoji) => (e.id ? `${e.name}:${e.id}` : e.name);

/** Affichage d'un émoji dans un message : Unicode tel quel, émoji du serveur en <:nom:id>. */
export const emojiText = (e: ReactionEmoji) => (e.id ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : e.name);

/** Lit un émoji saisi : « 🎮 », « <:nom:123> », « nom:123 ». */
export function parseEmojiInput(s: string): ReactionEmoji | null {
  const v = s.trim();
  if (!v) return null;
  const custom = v.match(/^<?(a)?:?([\w~-]{1,32}):(\d{5,})>?$/);
  if (custom) return { name: custom[2], id: custom[3], animated: !!custom[1] };
  if (/^[\w\s]+$/.test(v)) return null;
  return { name: v };
}

export type BotAction =
  | { type: 'role-add' | 'role-remove'; system: string; guildId: string; userId: string; roleId: string; roleName: string }
  | { type: 'send'; system: string; channelId: string; content: string };

export interface EngineContext {
  /** Id du bot : ses propres réactions sont ignorées. */
  botId?: string;
  /** Appareil courant : les messages de bienvenue / départ ne partent que de leur appareil. */
  device: string;
}

/** Texte de bienvenue / départ avec ses variables. */
export function fillMemberText(content: string, sys: { guildName?: string }, user: { id?: string; username?: string; global_name?: string | null }) {
  return content
    .replace(/\{user\}/g, user.id ? `<@${user.id}>` : user.username ?? '')
    .replace(/\{username\}/g, user.global_name || user.username || '')
    .replace(/\{server\}/g, sys.guildName ?? '');
}

/** Actions déclenchées par un événement du gateway. */
export function actionsFor(t: string, d: any, systems: BotSystem[], ctx: EngineContext): BotAction[] {
  if (!d) return [];
  const out: BotAction[] = [];
  if (t === 'MESSAGE_REACTION_ADD' || t === 'MESSAGE_REACTION_REMOVE') {
    const userId: string | undefined = d.user_id ?? d.member?.user?.id;
    if (!userId || userId === ctx.botId || d.member?.user?.bot) return out;
    const key = emojiKey(d.emoji ?? {});
    for (const s of systems) {
      if (s.kind !== 'reaction-roles' || !s.enabled || !s.messageId || s.messageId !== d.message_id) continue;
      const pair = s.pairs.find((p) => emojiKey(p.emoji) === key);
      if (!pair) continue;
      const guildId = d.guild_id ?? s.guildId;
      if (t === 'MESSAGE_REACTION_ADD') {
        out.push({ type: 'role-add', system: s.id, guildId, userId, roleId: pair.roleId, roleName: pair.roleName });
        // Un seul rôle du groupe à la fois : les autres sont retirés.
        if (s.mode === 'unique')
          for (const o of s.pairs) if (o.roleId !== pair.roleId) out.push({ type: 'role-remove', system: s.id, guildId, userId, roleId: o.roleId, roleName: o.roleName });
      } else if (s.mode !== 'add') out.push({ type: 'role-remove', system: s.id, guildId, userId, roleId: pair.roleId, roleName: pair.roleName });
    }
  } else if (t === 'GUILD_MEMBER_ADD' || t === 'GUILD_MEMBER_REMOVE') {
    const kind = t === 'GUILD_MEMBER_ADD' ? 'welcome' : 'goodbye';
    const user = d.user ?? {};
    if (user.bot) return out;
    for (const s of systems) {
      if (s.kind !== kind || !s.enabled || s.guildId !== d.guild_id) continue;
      if ((s as MemberMessageSystem).device && (s as MemberMessageSystem).device !== ctx.device) continue;
      out.push({ type: 'send', system: s.id, channelId: s.channelId, content: fillMemberText(s.content, s, user) });
    }
  }
  return out;
}

/** Événements du gateway nécessaires aux systèmes actifs (les autres restent ignorés). */
export function neededEvents(systems: BotSystem[]): string[] {
  const on = systems.filter((s) => s.enabled);
  const ev: string[] = [];
  if (on.some((s) => s.kind === 'reaction-roles' && s.messageId)) ev.push('MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE');
  if (on.some((s) => s.kind === 'welcome')) ev.push('GUILD_MEMBER_ADD');
  if (on.some((s) => s.kind === 'goodbye')) ev.push('GUILD_MEMBER_REMOVE');
  return ev;
}

/**
 * Règles compactes pour le service Android (JSON) : il applique exactement la même logique,
 * même quand l'app est fermée.
 */
export function compileRules(systems: BotSystem[], ctx: EngineContext & { api: string }) {
  const rr = systems
    .filter((s): s is ReactionRoleSystem => s.kind === 'reaction-roles' && s.enabled && !!s.messageId)
    .map((s) => ({ g: s.guildId, m: s.messageId, mode: s.mode, p: s.pairs.map((p) => ({ k: emojiKey(p.emoji), r: p.roleId })) }));
  const mm = systems
    .filter((s): s is MemberMessageSystem => (s.kind === 'welcome' || s.kind === 'goodbye') && s.enabled && (!s.device || s.device === ctx.device))
    .map((s) => ({ g: s.guildId, c: s.channelId, ev: s.kind === 'welcome' ? 'add' : 'remove', content: s.content, gn: s.guildName ?? '' }));
  return JSON.stringify({ api: ctx.api, botId: ctx.botId ?? '', rr, mm, events: neededEvents(systems) });
}

/** Texte proposé pour un message de rôles par réaction. */
export function defaultReactionText(pairs: { emoji: ReactionEmoji; roleId: string }[], title = '**Choisis tes rôles**') {
  const lines = pairs.filter((p) => p.roleId).map((p) => `${emojiText(p.emoji)} → <@&${p.roleId}>`);
  return [title, 'Réagis avec un émoji pour obtenir le rôle correspondant ; retire ta réaction pour le perdre.', '', ...lines].join('\n');
}
