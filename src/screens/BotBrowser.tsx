import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bot, guildIconUrl, avatarUrl, isForumType, isThreadType, webhookUrlOf, WEBHOOK_CHANNEL_TYPES } from '../api/fluxer';
import { useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { useEndpoints } from '../state/useEndpoints';
import { Avatar, Box, Button, EmptyState, Input, ListRow, Sheet, Stack, useToast } from '../components/ui';
import type { ApiChannel, ApiGuild, ApiWebhook } from '../types';
import { newTarget } from '../utils/factory';

const channelIcon = (type: number) =>
  type === 2 ? 'volume-medium-outline' : type === 5 ? 'megaphone-outline' : isForumType(type) ? 'chatbubbles-outline' : isThreadType(type) ? 'git-merge-outline' : 'chatbox-outline';

export function BotBrowser({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme: t, botToken, setBotToken } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { state, replace } = useEditor();

  const [tokenDraft, setTokenDraft] = useState('');
  const [me, setMe] = useState<{ id: string; username: string; avatar: string | null } | null>(null);
  const [guilds, setGuilds] = useState<ApiGuild[]>([]);
  const [guild, setGuild] = useState<ApiGuild | null>(null);
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [threads, setThreads] = useState<ApiChannel[]>([]);
  const [channel, setChannel] = useState<ApiChannel | null>(null);
  const [webhooks, setWebhooks] = useState<ApiWebhook[]>([]);
  const [newName, setNewName] = useState('FluxerHooks');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!visible || !botToken) return;
    run(async () => {
      const [u, g] = await Promise.all([bot.me(ep, botToken), bot.guilds(ep, botToken)]);
      setMe(u);
      setGuilds(g);
    });
  }, [visible, botToken, ep, run]);

  const openGuild = (g: ApiGuild) => {
    setGuild(g);
    setChannel(null);
    run(async () => {
      const [ch, th] = await Promise.all([
        bot.channels(ep, botToken, g.id),
        bot.activeThreads(ep, botToken, g.id).catch(() => ({ threads: [] as ApiChannel[] })),
      ]);
      setChannels(ch);
      setThreads(th.threads ?? []);
    });
  };

  const openChannel = (c: ApiChannel) => {
    setChannel(c);
    run(async () => {
      const [w, full] = await Promise.all([bot.webhooks(ep, botToken, c.id), bot.channel(ep, botToken, c.id).catch(() => c)]);
      setWebhooks(w.filter((x) => x.type === 1 && x.token));
      setChannel(full);
      if (isForumType(c.type)) {
        const arch = await bot.archivedThreads(ep, botToken, c.id).catch(() => ({ threads: [] as ApiChannel[] }));
        setThreads((prev) => {
          const ids = new Set(prev.map((x) => x.id));
          return [...prev, ...(arch.threads ?? []).filter((x) => !ids.has(x.id))];
        });
      }
    });
  };

  const pickWebhook = (w: ApiWebhook, mode: 'replace' | 'add') => {
    const url = webhookUrlOf(ep, w);
    const target = newTarget(url);
    const targets = mode === 'replace' ? [target] : [...state.targets.filter((x) => x.url.trim()), target];
    replace({ ...state, targets });
    toast(`Webhook « ${w.name} » sélectionné.`, 'success');
    onClose();
  };

  const pickThread = (th: ApiChannel, w?: ApiWebhook) => {
    const messages = state.messages.map((m) => ({ ...m, threadMode: 'thread' as const, thread_id: th.id }));
    const targets = w ? [newTarget(webhookUrlOf(ep, w))] : state.targets;
    replace({ targets, messages });
    toast(`Les messages iront dans « ${th.name} ».`, 'success');
    onClose();
  };

  const sorted = useMemo(() => {
    const cats = channels.filter((c) => c.type === 4).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const usable = channels.filter((c) => WEBHOOK_CHANNEL_TYPES.includes(c.type)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const groups: { title: string; items: ApiChannel[] }[] = [];
    const orphan = usable.filter((c) => !c.parent_id || !cats.find((k) => k.id === c.parent_id));
    if (orphan.length) groups.push({ title: 'Sans catégorie', items: orphan });
    cats.forEach((k) => {
      const items = usable.filter((c) => c.parent_id === k.id);
      if (items.length) groups.push({ title: k.name ?? 'Catégorie', items });
    });
    return groups;
  }, [channels]);

  const channelThreads = channel ? threads.filter((x) => x.parent_id === channel.id) : [];
  const title = channel ? (channel.name ?? 'Salon') : guild ? guild.name : 'Serveurs';

  const back = () => {
    if (channel) setChannel(null);
    else if (guild) setGuild(null);
  };

  let body: React.ReactNode;
  if (!botToken) {
    body = (
      <Stack>
        <Box title="Connecter un bot Fluxer" icon="hardware-chip-outline" collapsible={false}>
          <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: 19 }}>
            Avec le token d’un bot présent sur ton serveur, l’app liste tes serveurs, salons, threads, posts de forum et leurs tags, et peut créer des webhooks pour toi.
            Le token est stocké chiffré sur cet appareil (Android Keystore) et n’est envoyé qu’à l’API Fluxer.
          </Text>
          <Input
            label="Token du bot"
            value={tokenDraft}
            onChangeText={setTokenDraft}
            placeholder="ID_application.secret"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            mono
          />
          <Button variant="primary" icon="log-in-outline" label="Connecter" disabled={!tokenDraft.trim()} onPress={() => setBotToken(tokenDraft)} />
        </Box>
      </Stack>
    );
  } else if (!guild) {
    body = (
      <Stack gap={4}>
        {me && (
          <ListRow
            title={me.username}
            subtitle="Bot connecté"
            left={<Avatar uri={avatarUrl(ep, me.id, me.avatar)} name={me.username} size={36} />}
            right={<Button small variant="ghost" label="Déconnecter" onPress={() => { setBotToken(''); setMe(null); setGuilds([]); }} />}
          />
        )}
        {!loading && !guilds.length && !error && <EmptyState icon="server-outline" title="Aucun serveur" text="Invite ton bot sur un serveur Fluxer puis réessaie." />}
        {guilds.map((g) => (
          <ListRow key={g.id} title={g.name} left={<Avatar uri={guildIconUrl(ep, g.id, g.icon)} name={g.name} size={40} />} onPress={() => openGuild(g)} />
        ))}
      </Stack>
    );
  } else if (!channel) {
    body = (
      <Stack gap={4}>
        {sorted.map((grp) => (
          <View key={grp.title} style={{ gap: 2 }}>
            <Text style={{ color: t.textFaint, fontSize: t.font(11), fontWeight: '800', textTransform: 'uppercase', marginTop: 8, marginLeft: 12 }}>
              {grp.title}
            </Text>
            {grp.items.map((c) => {
              const n = threads.filter((x) => x.parent_id === c.id).length;
              return (
                <ListRow
                  key={c.id}
                  icon={channelIcon(c.type) as any}
                  title={c.name ?? c.id}
                  subtitle={isForumType(c.type) ? `Forum${n ? ` · ${n} post(s) actif(s)` : ''}` : n ? `${n} thread(s) actif(s)` : undefined}
                  onPress={() => openChannel(c)}
                />
              );
            })}
          </View>
        ))}
        {!loading && !sorted.length && <EmptyState icon="chatbox-outline" title="Aucun salon accessible" text="Le bot doit pouvoir voir les salons et gérer les webhooks." />}
      </Stack>
    );
  } else {
    const forum = isForumType(channel.type);
    body = (
      <Stack>
        <Box title="Webhooks de ce salon" icon="link" collapsible={false} badge={String(webhooks.length)}>
          {webhooks.map((w) => (
            <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar uri={avatarUrl(ep, w.id, w.avatar)} name={w.name} size={34} />
              <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontWeight: '600' }}>{w.name}</Text>
              <Button small variant="primary" label="Utiliser" onPress={() => pickWebhook(w, 'replace')} />
              <Button small label="+ Ajouter" onPress={() => pickWebhook(w, 'add')} />
            </View>
          ))}
          {!webhooks.length && !loading && <Text style={{ color: t.textMuted }}>Aucun webhook pour l’instant.</Text>}
          <Input value={newName} onChangeText={setNewName} label="Créer un webhook" max={80} placeholder="Nom du webhook" />
          <Button
            icon="add-circle-outline"
            label="Créer et utiliser"
            disabled={!newName.trim()}
            onPress={() =>
              run(async () => {
                const w = await bot.createWebhook(ep, botToken, channel.id, newName.trim());
                setWebhooks((prev) => [...prev, w]);
                pickWebhook(w, 'replace');
              })
            }
          />
        </Box>
        {(forum || channelThreads.length > 0) && (
          <Box title={forum ? 'Posts du forum' : 'Threads actifs'} icon="git-merge-outline" collapsible={false} badge={String(channelThreads.length)}>
            {forum && !!channel.available_tags?.length && (
              <Text style={{ color: t.textMuted, fontSize: t.font(12) }}>
                Tags : {channel.available_tags.map((x) => x.name).join(', ')}
              </Text>
            )}
            {channelThreads.map((th) => (
              <ListRow
                key={th.id}
                icon={th.thread_metadata?.locked ? 'lock-closed-outline' : th.thread_metadata?.archived ? 'archive-outline' : 'git-merge-outline'}
                title={th.name ?? th.id}
                subtitle={th.thread_metadata?.archived ? 'Archivé (sera désarchivé à l’envoi)' : undefined}
                onPress={() => pickThread(th, webhooks[0])}
              />
            ))}
            {!channelThreads.length && <Text style={{ color: t.textMuted }}>Aucun post. Utilise « Forum » dans un message pour en créer un.</Text>}
          </Box>
        )}
      </Stack>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      full
      footer={
        (guild || channel) && (
          <Button icon="arrow-back" label="Retour" onPress={back} />
        )
      }
    >
      {loading && (
        <View style={{ padding: 16, alignItems: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}
      {error && (
        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: t.surface, padding: 12, borderRadius: t.radiusSm, borderLeftWidth: 4, borderLeftColor: t.danger }}>
          <Ionicons name="alert-circle" size={18} color={t.danger} />
          <Text style={{ color: t.text, flex: 1 }}>{error}</Text>
        </View>
      )}
      {body}
    </Sheet>
  );
}
