import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { tr } from '../i18n';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFor, avatarUrl, guildIconUrl, isForumType, isThreadType, webhookUrlOf } from '../api/fluxer';
import { useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { useSession, type Source } from '../state/session';
import { useEndpoints } from '../state/useEndpoints';
import { Avatar, Box, Button, Chip, EmptyState, Input, ListRow, Segmented, Sheet, Stack, useToast } from '../components/ui';
import { ChannelIcon, Dropdown, channelTypeLabel } from '../components/Dropdown';
import { findChannel, orderChannels } from '../utils/channels';
import { newTarget } from '../utils/factory';
import { useBotDestinations } from '../state/useBotDestinations';
import type { ApiChannel, ApiGuild, ApiWebhook } from '../types';

const ADMINISTRATOR = BigInt(1) << BigInt(3);
const MANAGE_WEBHOOKS = BigInt(1) << BigInt(29);

/** Rôle de l'utilisateur dans le serveur, d'après owner_id et permissions (null : inconnu). */
function guildRole(g: ApiGuild, meId?: string): 'owner' | 'admin' | 'webhooks' | 'member' | null {
  if (meId && g.owner_id === meId) return 'owner';
  if (!g.permissions) return null;
  try {
    const p = BigInt(g.permissions);
    if ((p & ADMINISTRATOR) !== BigInt(0)) return 'admin';
    if ((p & MANAGE_WEBHOOKS) !== BigInt(0)) return 'webhooks';
    return 'member';
  } catch {
    return null;
  }
}
const ROLE_LABEL = { owner: 'Propriétaire', admin: 'Administrateur', webhooks: 'Gère les webhooks', member: 'Membre' } as const;

/**
 * Navigateur de serveurs : via le compte Fluxer ou le bot.
 * Menus déroulants Serveur → Salon (rangés par catégorie, avec icônes), puis webhooks / threads / posts.
 */
export function BotBrowser({ visible, onClose, onOpenAccount }: { visible: boolean; onClose: () => void; onOpenAccount: () => void }) {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { state, replace } = useEditor();
  const session = useSession();
  const bots = useBotDestinations();

  const [source, setSource] = useState<Source | null>(session.defaultSource);
  const [guildId, setGuildId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<ApiWebhook[]>([]);
  const [archived, setArchived] = useState<ApiChannel[]>([]);
  /** Tous les webhooks du serveur sélectionné (null : pas encore chargés ou inaccessibles). */
  const [guildHooks, setGuildHooks] = useState<ApiWebhook[] | null>(null);
  const [hooksError, setHooksError] = useState<string | null>(null);
  const [allGuilds, setAllGuilds] = useState(false);
  const [newName, setNewName] = useState('FluxerHooks');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source || (source === 'user' && !session.hasUser) || (source === 'bot' && !session.hasBot)) setSource(session.defaultSource);
  }, [session.hasUser, session.hasBot, session.defaultSource, source]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Compte : seulement les serveurs administrés par défaut. Bot : tous ses serveurs.
  useEffect(() => setAllGuilds(source === 'bot'), [source]);

  useEffect(() => {
    if (!visible || !source) return;
    setGuildId(null);
    setChannelId(null);
    run(async () => void (await session.loadGuilds(source)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, source]);

  const guilds = source ? session.guilds[source] : [];
  const data = guildId ? session.guildData[guildId] : undefined;
  const allThreads = useMemo(() => {
    const ids = new Set((data?.threads ?? []).map((x) => x.id));
    return [...(data?.threads ?? []), ...archived.filter((x) => !ids.has(x.id))];
  }, [data, archived]);
  const selected = data ? findChannel(data.channels, allThreads, channelId) : undefined;
  const parent = selected && isThreadType(selected.type) ? data?.channels.find((c) => c.id === selected.parent_id) : selected;

  const pickGuild = (id: string) => {
    setGuildId(id);
    setChannelId(null);
    setWebhooks([]);
    setArchived([]);
    setGuildHooks(null);
    setHooksError(null);
    if (!source) return;
    run(async () => {
      const api = apiFor(ep, session.credential(source)!);
      // Salons + webhooks du serveur en parallèle : les webhooks s'affichent dès le choix du serveur.
      const [, hooks] = await Promise.all([
        session.loadGuild(source, id),
        api.guildWebhooks(id).catch((e) => {
          setHooksError(e instanceof Error ? e.message : String(e));
          return null;
        }),
      ]);
      setGuildHooks(hooks ? hooks.filter((x) => x.type === 1 && x.token) : null);
    });
  };

  const pickChannel = (id: string) => {
    setChannelId(id);
    if (!source || !data) return;
    const ch = findChannel(data.channels, allThreads, id);
    const hookChannel = ch && isThreadType(ch.type) ? ch.parent_id : id;
    run(async () => {
      const api = apiFor(ep, session.credential(source)!);
      const [w, full] = await Promise.all([
        // Webhooks déjà chargés pour tout le serveur : simple filtre par salon.
        guildHooks ? Promise.resolve(guildHooks.filter((x) => x.channel_id === hookChannel)) : api.webhooks(hookChannel!).catch((e) => {
          // Avec un bot, les webhooks sont facultatifs : il peut publier lui-même.
          if (source === 'bot') return [] as ApiWebhook[];
          throw new Error(`Webhooks inaccessibles : ${e instanceof Error ? e.message : e}. Il faut la permission « Gérer les webhooks ».`);
        }),
        api.channel(hookChannel!).catch(() => undefined),
      ]);
      setWebhooks(w.filter((x) => x.type === 1 && x.token));
      if (full && isForumType(full.type)) {
        const arch = await api.archivedThreads(full.id).catch(() => [] as ApiChannel[]);
        setArchived((prev) => [...prev.filter((x) => x.parent_id !== full.id), ...arch]);
      }
    });
  };

  const pickWebhook = (w: ApiWebhook, mode: 'replace' | 'add') => {
    const target = newTarget(webhookUrlOf(ep, w));
    const keepBots = state.targets.filter((x) => x.url.startsWith('bot:'));
    const targets = mode === 'replace' ? [target, ...keepBots] : [...state.targets.filter((x) => x.url.trim()), target];
    // Si un thread est sélectionné, tous les messages y seront envoyés.
    const messages =
      selected && isThreadType(selected.type)
        ? state.messages.map((m) => ({ ...m, threadMode: 'thread' as const, thread_id: selected.id }))
        : state.messages;
    replace({ targets, messages });
    toast(`Webhook « ${w.name} » sélectionné${selected && isThreadType(selected.type) ? ` · thread « ${selected.name} »` : ''}.`, 'success');
    onClose();
  };

  /* ----- Options des menus ----- */
  const meId = source === 'user' ? session.user?.id : session.botUser?.id;
  const roles = new Map(guilds.map((g) => [g.id, guildRole(g, meId)]));
  const managed = guilds.filter((g) => roles.get(g.id) !== 'member');
  const shownGuilds = allGuilds ? guilds : managed;
  const guildOptions = shownGuilds.map((g) => {
    const r = roles.get(g.id);
    return {
      value: g.id,
      label: g.name,
      subtitle: r ? ROLE_LABEL[r] : undefined,
      left: <Avatar uri={guildIconUrl(ep, g.id, g.icon)} name={g.name} size={t.z(32)} shape="rounded" />,
    };
  });
  const hookCount = (id: string) => guildHooks?.filter((x) => x.channel_id === id).length ?? 0;
  const ordered = data ? orderChannels(data.channels, allThreads, { withThreads: true }) : [];
  // Webhooks du serveur rangés dans l'ordre des salons.
  const hookGroups = guildHooks
    ? ordered
        .filter((e) => !isThreadType(e.channel.type) && hookCount(e.channel.id) > 0)
        .map((e) => ({ channel: e.channel, hooks: guildHooks.filter((x) => x.channel_id === e.channel.id) }))
    : [];

  const hookRow = (w: ApiWebhook) => (
    <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Avatar uri={avatarUrl(ep, w.id, w.avatar)} name={w.name} size={t.z(34)} />
      <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontWeight: '600', fontSize: t.font(14) }}>{w.name}</Text>
      <Button small variant="primary" label="Utiliser" onPress={() => pickWebhook(w, 'replace')} />
      <Button small icon="add" onPress={() => pickWebhook(w, 'add')} />
    </View>
  );
  const channelOptions = data
    ? orderChannels(data.channels, allThreads, { withThreads: true }).map((e) => ({
        value: e.channel.id,
        label: e.channel.name ?? e.channel.id,
        subtitle: isThreadType(e.channel.type)
          ? e.channel.thread_metadata?.archived
            ? 'Archivé · sera désarchivé à l’envoi'
            : e.channel.thread_metadata?.locked
              ? 'Verrouillé'
              : channelTypeLabel(e.channel.type)
          : channelTypeLabel(e.channel.type) + (hookCount(e.channel.id) ? ` · ${hookCount(e.channel.id)} webhook${hookCount(e.channel.id) > 1 ? 's' : ''}` : ''),
        group: e.group,
        indent: e.indent,
        left: <ChannelIcon type={e.channel.type} />,
      }))
    : [];

  let body: React.ReactNode;
  if (!source) {
    body = (
      <Stack>
        <EmptyState icon="people-circle-outline" title="Connecte un compte ou un bot" text="Pour parcourir tes serveurs et salons, connecte ton compte Fluxer ou le token d’un bot." />
        <Button
          variant="primary"
          icon="person-circle-outline"
          label="Se connecter à mon compte Fluxer"
          onPress={() => {
            onClose();
            onOpenAccount();
          }}
        />
        <Text style={{ color: t.textMuted, fontSize: t.font(13), textAlign: 'center' }}>
          {tr("Pour utiliser un bot, colle son token dans la carte « Bot Fluxer » de l’éditeur.")}
        </Text>
      </Stack>
    );
  } else {
    const forum = parent && isForumType(parent.type);
    const posts = parent ? allThreads.filter((x) => x.parent_id === parent.id) : [];
    body = (
      <Stack>
        {session.hasUser && session.hasBot && (
          <Segmented
            value={source}
            onChange={setSource}
            options={[
              { value: 'user', label: 'Mon compte', icon: 'person-outline' },
              { value: 'bot', label: 'Bot', icon: 'hardware-chip-outline' },
            ]}
          />
        )}
        {source === 'user' && session.user && (
          <ListRow
            title={session.user.global_name || session.user.username}
            subtitle={`@${session.user.username}`}
            left={<Avatar uri={avatarUrl(ep, session.user.id, session.user.avatar)} name={session.user.username} size={t.z(36)} />}
            onPress={() => {
              onClose();
              onOpenAccount();
            }}
          />
        )}
        {source === 'bot' && session.botUser && (
          <ListRow
            title={session.botUser.username}
            subtitle="Bot connecté"
            left={<Avatar uri={avatarUrl(ep, session.botUser.id, session.botUser.avatar)} name={session.botUser.username} size={t.z(36)} />}
          />
        )}
        <Dropdown
          label={allGuilds ? 'Serveur' : 'Serveur que tu administres'}
          title="Choisir un serveur"
          placeholder="Choisir un serveur"
          value={guildId}
          options={guildOptions}
          onChange={pickGuild}
          loading={loading && !guilds.length}
          emptyText={allGuilds ? 'Aucun serveur' : 'Aucun serveur administré : affiche tous tes serveurs.'}
        />
        {guilds.length > managed.length && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip
              icon={allGuilds ? 'shield-outline' : 'albums-outline'}
              label={allGuilds ? `Seulement ceux que j’administre (${managed.length})` : `Tous mes serveurs (${guilds.length})`}
              selected={allGuilds}
              onPress={() => setAllGuilds((v) => !v)}
            />
          </View>
        )}
        {guildId && (
          <Dropdown
            label="Salon, thread ou post"
            title="Choisir un salon"
            placeholder="Choisir un salon"
            value={channelId}
            options={channelOptions}
            onChange={pickChannel}
            loading={loading && !data}
            emptyText="Aucun salon accessible (permissions « Voir le salon » et « Gérer les webhooks » requises)."
          />
        )}
        {guildId && !selected && (
          <Box
            title="Webhooks du serveur"
            icon="link"
            collapsible={false}
            badge={guildHooks ? String(guildHooks.length) : undefined}
            subtitle={guildHooks?.length ? 'Utilise-en un, ou choisis un salon ci-dessous' : undefined}
          >
            {hooksError && (
              <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>
                {tr("Liste inaccessible (")}{hooksError}). Il faut la permission « Gérer les webhooks » sur ce serveur ; choisis un salon pour voir les siens.
              </Text>
            )}
            {guildHooks && !guildHooks.length && <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>{tr("Aucun webhook sur ce serveur : choisis un salon pour en créer un.")}</Text>}
            {hookGroups.map((g) => (
              <View key={g.channel.id} style={{ gap: 8 }}>
                <Pressable onPress={() => pickChannel(g.channel.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="button" accessibilityLabel={`Ouvrir ${g.channel.name}`}>
                  <ChannelIcon type={g.channel.type} size={t.z(16)} />
                  <Text style={{ flex: 1, color: t.textMuted, fontWeight: '800', fontSize: t.font(12), letterSpacing: 0.5 }}>{(g.channel.name ?? '').toUpperCase()}</Text>
                  <Ionicons name="chevron-forward" size={t.z(16)} color={t.textFaint} />
                </Pressable>
                {g.hooks.map(hookRow)}
              </View>
            ))}
          </Box>
        )}

        {selected && source === 'bot' && (
          <Box title="Publier avec le bot" icon="flash-outline" collapsible={false}>
            <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>
              {tr("Le bot écrit directement dans")} {isThreadType(selected.type) ? 'ce thread' : isForumType(selected.type) ? 'ce forum (nouveau post)' : 'ce salon'} : pas besoin de webhook.
            </Text>
            <Button
              variant="primary"
              icon="flash"
              label={`Publier dans « ${selected.name ?? selected.id} »`}
              onPress={() => {
                const r = bots.add(selected, guilds.find((g) => g.id === guildId));
                toast(r === 'added' ? `Destination ajoutée : le bot publiera dans « ${selected.name} ».` : 'Ce salon est déjà une destination.', r === 'added' ? 'success' : 'info');
                onClose();
              }}
            />
          </Box>
        )}

        {selected && (
          <Box
            title={source === 'bot' ? 'Ou passer par un webhook' : selected && isThreadType(selected.type) ? `Webhooks de #${parent?.name ?? ''}` : 'Webhooks de ce salon'}
            subtitle={selected && isThreadType(selected.type) ? `Les messages iront dans « ${selected.name} »` : source === 'bot' ? 'Nom et avatar personnalisés par message' : undefined}
            icon="link"
            collapsible={source === 'bot'}
            defaultCollapsed={source === 'bot'}
            badge={String(webhooks.length)}
          >
            {webhooks.map(hookRow)}
            {!webhooks.length && !loading && <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>{tr("Aucun webhook utilisable dans ce salon : crée-en un ci-dessous.")}</Text>}
            <Input value={newName} onChangeText={setNewName} label="Créer un webhook" max={80} placeholder="Nom du webhook" />
            <Button
              icon="add-circle-outline"
              label="Créer et utiliser"
              disabled={!newName.trim() || !parent}
              onPress={() =>
                run(async () => {
                  const w = await apiFor(ep, session.credential(source)!).createWebhook(parent!.id, newName.trim());
                  setWebhooks((prev) => [...prev, w]);
                  setGuildHooks((h) => (h ? [...h, w] : h));
                  pickWebhook(w, 'replace');
                })
              }
            />
          </Box>
        )}

        {forum && parent && (
          <Box title="Posts et tags du forum" icon="chatbubbles-outline" collapsible={false} badge={String(posts.length)}>
            {!!parent.available_tags?.length && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {parent.available_tags.map((tag) => (
                  <View key={tag.id} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.surface2 }}>
                    <Text style={{ color: t.text, fontSize: t.font(12) }}>
                      {tag.emoji_name ? `${tag.emoji_name} ` : ''}
                      {tag.name}
                      {tag.moderated ? ' 🔒' : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={{ color: t.textMuted, fontSize: t.font(12) }}>
              {tr("Choisis un post dans le menu « Salon » pour y répondre, ou garde le forum et utilise « Forum » dans un message pour créer un nouveau post avec ses tags.")}
            </Text>
          </Box>
        )}
      </Stack>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Mes serveurs" full>
      {loading && (
        <View style={{ padding: 8, alignItems: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}
      {error && (
        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: t.surface, padding: 12, borderRadius: t.radiusSm, borderLeftWidth: 4, borderLeftColor: t.danger }}>
          <Ionicons name="alert-circle" size={t.z(18)} color={t.danger} />
          <Text style={{ color: t.text, flex: 1, fontSize: t.font(13) }}>{error}</Text>
        </View>
      )}
      {body}
    </Sheet>
  );
}
