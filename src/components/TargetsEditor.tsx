import React, { useEffect, useRef, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useEditor } from '../state/editor';
import { useSettings } from '../state/settings';
import { useSender } from '../state/useSender';
import { useEndpoints } from '../state/useEndpoints';
import { apiFor, avatarUrl, guildIconUrl, isForumType } from '../api/fluxer';
import { Ionicons } from '@expo/vector-icons';
import { useBotDestinations } from '../state/useBotDestinations';
import { ChannelIcon, Dropdown, channelTypeLabel } from './Dropdown';
import { findChannel, orderChannels } from '../utils/channels';
import { useSession } from '../state/session';
import { botTargetUrl, parseBotTarget, parseWebhookUrl } from '../utils/parse';
import { Avatar, Box, Button, FieldButton, FieldButtons, Grid, IconBtn, Input, Stack, useToast } from './ui';
import type { WebhookTarget } from '../types';

function TargetRow({ tg, canRemove }: { tg: WebhookTarget; canRemove: boolean }) {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const { updateTarget, removeTarget } = useEditor();
  const { validateTarget } = useSender();
  const last = useRef('');

  // Validation automatique quand une URL complète est saisie ou collée.
  useEffect(() => {
    if (tg.url === last.current) return;
    if (!tg.url.trim()) {
      last.current = tg.url;
      if (tg.info || tg.error) updateTarget(tg.id, { info: undefined, error: undefined });
      return;
    }
    if (!parseWebhookUrl(tg.url)) return;
    last.current = tg.url;
    const h = setTimeout(() => validateTarget(tg), 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tg.url]);

  const info = tg.info;
  return (
    <View style={{ gap: 8, opacity: tg.enabled ? 1 : 0.55 }}>
      <Input
        value={tg.url}
        onChangeText={(v) => updateTarget(tg.id, { url: v.trim() })}
        onBlur={() => tg.url.trim() && !parseWebhookUrl(tg.url) && updateTarget(tg.id, { error: 'URL de webhook invalide' })}
        placeholder="https://api.fluxer.app/webhooks/…/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        secureTextEntry={false}
        error={tg.error}
        right={
          <FieldButtons>
            <FieldButton mci="content-paste" label="Coller depuis le presse-papiers" onPress={async () => updateTarget(tg.id, { url: (await Clipboard.getStringAsync()).trim() })} />
            {canRemove && <FieldButton icon="close" label="Retirer ce webhook" onPress={() => removeTarget(tg.id)} />}
          </FieldButtons>
        }
      />
      {info && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface2, borderRadius: t.radiusSm, padding: 10 }}>
          <Avatar uri={avatarUrl(ep, info.id, info.avatar)} name={info.name} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: t.font(14) }}>{info.name}</Text>
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>
              {info.channelName ? `${isForumType(info.channelType ?? 0) ? 'Forum' : '#'} ${info.channelName}` : `Salon ${info.channel_id}`}
            </Text>
          </View>
          <Switch
            value={tg.enabled}
            onValueChange={(v) => updateTarget(tg.id, { enabled: v })}
            trackColor={{ false: t.border, true: t.accentSoft }}
            thumbColor={tg.enabled ? t.accent : t.textFaint}
            accessibilityLabel="Activer ce webhook"
          />
          <IconBtn icon="refresh" label="Revérifier" size={18} onPress={() => validateTarget(tg)} />
        </View>
      )}
    </View>
  );
}

/**
 * Conteneur « Bot Fluxer » : le SEUL endroit où l'on saisit / retire le token du bot.
 * Vérifié auprès de l'API avant d'être enregistré (chiffré, Android Keystore).
 */
export function BotCard({ onBrowse }: { onBrowse: () => void }) {
  const { theme: t, botToken, setBotToken, haptic } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { botUser } = useSession();
  const { list } = useBotDestinations();
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    const tok = draft.trim().replace(/^Bot\s+/i, '');
    if (!tok) return;
    setBusy(true);
    setError(null);
    try {
      const me = await apiFor(ep, { kind: 'bot', token: tok }).me();
      await setBotToken(tok);
      setDraft('');
      haptic('success');
      toast(`Bot « ${me.username} » connecté.`, 'success');
    } catch (e) {
      haptic('error');
      setError(e instanceof Error ? e.message : 'Token invalide.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      title="Bot Fluxer"
      icon="hardware-chip-outline"
      subtitle={
        botToken
          ? `${botUser ? botUser.username : 'Bot connecté'} · ${list.length ? `${list.length} salon(s)` : 'choisis où publier'}`
          : 'Publier directement avec un bot, sans webhook'
      }
      badge={list.filter((x) => x.enabled).length ? String(list.filter((x) => x.enabled).length) : undefined}
    >
      {botToken ? (
        <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar uri={botUser ? avatarUrl(ep, botUser.id, botUser.avatar) : null} name={botUser?.username ?? 'Bot'} size={t.z(36)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: t.font(14) }}>{botUser?.username ?? 'Bot connecté'}</Text>
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>Token chiffré sur ce téléphone</Text>
          </View>
          <FieldButtons>
            <FieldButton icon="albums-outline" label="Parcourir les serveurs du bot" onPress={onBrowse} />
            <FieldButton
              icon="log-out-outline"
              label="Retirer le token"
              color={t.danger}
              onPress={() =>
                Alert.alert('Retirer le token du bot ?', 'Il sera effacé de ce téléphone.', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Retirer', style: 'destructive', onPress: () => setBotToken('') },
                ])
              }
            />
          </FieldButtons>
        </View>
        <BotDestinations />
        </>
      ) : (
        <>
          <Input
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setError(null);
            }}
            placeholder="Token du bot (ID_application.secret)"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            mono
            error={error}
            hint="Envoyé uniquement à l’API Fluxer, stocké chiffré (Android Keystore)."
            right={
              <FieldButtons>
                <FieldButton mci={show ? 'eye-off-outline' : 'eye-outline'} label={show ? 'Masquer le token' : 'Afficher le token'} onPress={() => setShow((v) => !v)} />
                <FieldButton mci="content-paste" label="Coller le token" onPress={async () => setDraft((await Clipboard.getStringAsync()).trim())} />
              </FieldButtons>
            }
          />
          <Button small variant="primary" icon="log-in-outline" label="Connecter le bot" loading={busy} disabled={!draft.trim()} onPress={connect} />
        </>
      )}
    </Box>
  );
}

/** Salons où le bot publie lui-même (sans webhook) + sélecteur serveur → salon. */
function BotDestinations() {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const session = useSession();
  const { list, add, update, remove } = useBotDestinations();
  const { validateTarget } = useSender();
  const [guildId, setGuildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const guilds = session.guilds.bot;
  const data = guildId ? session.guildData[guildId] : undefined;

  useEffect(() => {
    session.loadGuilds('bot').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.hasBot]);

  // Rafraîchit les infos (nom du salon, tags de forum) des destinations restaurées d'une sauvegarde.
  useEffect(() => {
    list.filter((x) => !x.info?.channelName && !x.error).forEach((x) => validateTarget(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const pickGuild = async (id: string) => {
    setGuildId(id);
    setLoading(true);
    try {
      await session.loadGuild('bot', id);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setLoading(false);
    }
  };
  const pickChannel = (id: string) => {
    if (!data) return;
    const ch = findChannel(data.channels, data.threads, id);
    if (!ch) return;
    const g = guilds.find((x) => x.id === guildId);
    const r = add(ch, g);
    toast(r === 'added' ? `Le bot publiera dans « ${ch.name} ».` : 'Ce salon est déjà une destination.', r === 'added' ? 'success' : 'info');
  };

  const channelOptions = data
    ? orderChannels(data.channels, data.threads, { types: [0, 5, 15, 16], withThreads: true }).map((e) => ({
        value: e.channel.id,
        label: e.channel.name ?? e.channel.id,
        subtitle: channelTypeLabel(e.channel.type),
        group: e.group,
        indent: e.indent,
        left: <ChannelIcon type={e.channel.type} />,
        disabled: list.some((x) => x.url === botTargetUrl(e.channel.id)),
      }))
    : [];

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: t.radiusSm, backgroundColor: t.accentSoft }}>
        <Ionicons name="flash-outline" size={t.z(16)} color={t.accent} />
        <Text style={{ flex: 1, color: t.text, fontSize: t.font(12), lineHeight: t.font(17) }}>
          Le bot publie lui-même : aucun webhook à créer. Messages, embeds, fichiers, threads et nouveaux posts de forum (avec tags) sont pris en charge.
        </Text>
      </View>
      {list.map((tg) => (
        <View key={tg.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: t.radiusSm, backgroundColor: t.surface2, opacity: tg.enabled ? 1 : 0.55 }}>
          <View style={{ width: t.z(34), height: t.z(34), borderRadius: t.radiusSm, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <ChannelIcon type={tg.info?.channelType ?? 0} color={t.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: t.font(14) }}>
              {tg.info?.channelName ?? parseBotTarget(tg.url)?.channelId}
            </Text>
            <Text numberOfLines={1} style={{ color: tg.error ? t.danger : t.textMuted, fontSize: t.font(12) }}>
              {tg.error ?? [channelTypeLabel(tg.info?.channelType ?? 0), tg.info?.guildName].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Switch
            value={tg.enabled}
            onValueChange={(v) => update(tg.id, { enabled: v })}
            trackColor={{ false: t.border, true: t.accentSoft }}
            thumbColor={tg.enabled ? t.accent : t.textFaint}
            accessibilityLabel="Activer cette destination"
          />
          <FieldButton icon="close" label="Retirer ce salon" onPress={() => remove(tg.id)} />
        </View>
      ))}
      <Grid min={220} gap={8}>
        <Dropdown
          label="Serveur du bot"
          title="Choisir un serveur"
          placeholder={guilds.length ? 'Choisir un serveur' : 'Aucun serveur'}
          value={guildId}
          options={guilds.map((g) => ({ value: g.id, label: g.name, left: <Avatar uri={guildIconUrl(ep, g.id, g.icon)} name={g.name} size={t.z(30)} shape="rounded" /> }))}
          onChange={pickGuild}
          emptyText="Le bot n’est sur aucun serveur."
        />
        {guildId && (
          <Dropdown
            label={list.length ? 'Ajouter un salon' : 'Salon où publier'}
            title="Choisir un salon"
            placeholder="Salon, thread ou forum"
            value={null}
            options={channelOptions}
            onChange={pickChannel}
            loading={loading && !data}
            emptyText="Aucun salon accessible au bot (permissions « Voir le salon » et « Envoyer des messages »)."
          />
        )}
      </Grid>
    </View>
  );
}

export function TargetsEditor({ onBrowse }: { onBrowse: () => void }) {
  const { state, addTarget } = useEditor();
  const { botToken, userToken } = useSettings();
  const hooks = state.targets.filter((x) => !parseBotTarget(x.url));
  const valid = hooks.filter((x) => x.info).length;
  // Toujours au moins un champ d'URL de webhook.
  useEffect(() => {
    if (!hooks.length) addTarget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hooks.length]);
  return (
    <Box
      title="Webhooks"
      icon="link"
      subtitle={valid ? `${valid} webhook(s) vérifié(s)` : 'Colle l’URL d’un webhook Fluxer'}
      badge={hooks.length > 1 ? String(hooks.length) : undefined}
    >
      {hooks.map((tg) => (
        <TargetRow key={tg.id} tg={tg} canRemove={hooks.length > 1 || !!tg.url} />
      ))}
      <Stack row wrap gap={8}>
        <Button small icon="add" label="Autre webhook" onPress={() => addTarget()} />
        <Button small icon="server-outline" label={botToken || userToken ? 'Parcourir mes serveurs' : 'Choisir sur mon serveur'} onPress={onBrowse} />
      </Stack>
    </Box>
  );
}
