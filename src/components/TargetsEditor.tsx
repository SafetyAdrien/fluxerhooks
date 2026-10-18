import React, { useEffect, useRef, useState } from 'react';
import { BOT_ENABLED } from '../config';
import { tr } from '../i18n';
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native';
import { withAlpha } from '../utils/parse';
import { useBotGateway } from '../state/botGateway';
import type { BotStatus } from '../types';
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
/** Carte « Bot Fluxer » grisée tant que la fonction est désactivée. */
function BotCardDisabled() {
  return (
    <View style={{ opacity: 0.45 }} pointerEvents="none" accessibilityState={{ disabled: true }}>
      <Box title="Bot Fluxer" icon="hardware-chip-outline" subtitle="Bientôt disponible" badge="Bientôt" collapsed onToggle={() => {}} />
    </View>
  );
}

export function BotCard({ onBrowse }: { onBrowse: () => void }) {
  if (!BOT_ENABLED) return <BotCardDisabled />;
  return <BotCardActive onBrowse={onBrowse} />;
}

function BotCardActive({ onBrowse }: { onBrowse: () => void }) {
  const { theme: t, botToken, setBotToken, haptic } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { botUser } = useSession();
  const { list } = useBotDestinations();
  const gw = useBotGateway();
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
      toast(`Bot « ${me.username} » connecté : démarrage…`, 'success');
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
      defaultCollapsed
      subtitle={
        botToken
          ? `${botUser ? botUser.username : 'Bot'} · ${gw.state.state === 'online' ? 'en ligne' : gw.state.state === 'error' ? 'erreur' : gw.state.state === 'offline' ? 'arrêté' : 'connexion…'} · ${list.length ? `${list.length} salon(s)` : 'choisis où publier'}`
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
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>{tr("Token chiffré sur ce téléphone")}</Text>
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
        <BotRuntime />
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

const STATUS_COLORS: Record<string, string> = { online: '#23A55A', idle: '#F0B232', dnd: '#F23F43', invisible: '#80848E' };

/** Bot démarré : connexion au gateway, statut publié et statut personnalisé. */
function BotRuntime() {
  const { theme: t, settings } = useSettings();
  const gw = useBotGateway();
  const p = settings.botPresence;
  const [text, setText] = useState(p.text);
  useEffect(() => setText(p.text), [p.text]);
  const st = gw.state.state;
  const live = st === 'online';
  const busy = st === 'connecting' || st === 'reconnecting';
  const dot = live ? STATUS_COLORS[p.status] : st === 'error' ? t.danger : busy ? t.warning : t.textFaint;
  const since = gw.state.since ? new Date(gw.state.since).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null;
  const label = live
    ? `En ligne${gw.state.guilds ? ` · ${gw.state.guilds} serveur${gw.state.guilds > 1 ? 's' : ''}` : ''}${since ? ` · depuis ${since}` : ''}`
    : st === 'connecting'
      ? 'Démarrage du bot…'
      : st === 'reconnecting'
        ? 'Reconnexion au gateway…'
        : st === 'error'
          ? gw.state.error ?? 'Erreur de connexion'
          : 'Bot arrêté (hors ligne)';

  return (
    <View style={{ gap: 10, padding: 10, borderRadius: t.radiusSm, backgroundColor: t.surface2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: t.z(12), height: t.z(12), borderRadius: 99, backgroundColor: dot }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: t.font(14) }}>{tr(live ? 'Bot démarré' : busy ? 'Connexion…' : st === 'error' ? 'Le bot n’a pas pu démarrer' : 'Bot arrêté')}</Text>
          <Text numberOfLines={2} style={{ color: st === 'error' ? t.danger : t.textMuted, fontSize: t.font(12) }}>
            {label}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator color={t.accent} />
        ) : live ? (
          <Button small icon="stop-circle-outline" label="Arrêter" onPress={gw.stop} />
        ) : (
          <Button small variant="primary" icon="play" label="Démarrer" onPress={() => gw.start()} />
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(
          [
            ['online', tr('En ligne')],
            ['idle', tr('Absent')],
            ['dnd', tr('Ne pas déranger')],
            ['invisible', tr('Invisible')],
          ] as [BotStatus, string][]
        ).map(([v, l]) => (
          <Pressable
            key={v}
            onPress={() => gw.setPresence(v, text)}
            accessibilityRole="radio"
            accessibilityState={{ selected: p.status === v }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: p.status === v ? STATUS_COLORS[v] : t.border,
              backgroundColor: pressed ? t.surface : p.status === v ? withAlpha(STATUS_COLORS[v], 0.16) : 'transparent',
            })}
          >
            <View style={{ width: t.z(9), height: t.z(9), borderRadius: 99, backgroundColor: STATUS_COLORS[v] }} />
            <Text style={{ color: t.text, fontSize: t.font(13), fontWeight: p.status === v ? '700' : '500' }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <Input
        value={text}
        onChangeText={setText}
        onBlur={() => text !== p.text && gw.setPresence(p.status, text)}
        onSubmitEditing={() => gw.setPresence(p.status, text)}
        placeholder="Statut personnalisé (facultatif)"
        maxLength={128}
        returnKeyType="done"
        right={
          text !== p.text ? <FieldButton icon="checkmark" label="Appliquer le statut" active onPress={() => gw.setPresence(p.status, text)} /> : undefined
        }
      />
      <Text style={{ color: t.textFaint, fontSize: t.font(11), lineHeight: t.font(15) }}>
        {gw.background
          ? 'Le bot reste en ligne même app fermée : une notification « Bot en ligne » l’indique et permet de l’arrêter.'
          : 'Le bot reste en ligne tant que cette page est ouverte.'}
      </Text>
    </View>
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
          {tr("Le bot publie lui-même : aucun webhook à créer. Messages, embeds, fichiers, threads et nouveaux posts de forum (avec tags) sont pris en charge.")}
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
      defaultCollapsed
      memoryKey="editor:webhooks"
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
