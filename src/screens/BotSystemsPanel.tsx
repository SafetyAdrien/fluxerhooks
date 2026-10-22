/**
 * Systèmes du bot (page Données → Automatisations) : rôles par réaction, message de bienvenue
 * et message de départ, exécutés par le bot Fluxer de l'utilisateur.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { tr } from '../i18n';
import { useSettings } from '../state/settings';
import { useEndpoints } from '../state/useEndpoints';
import { useBotGateway } from '../state/botGateway';
import { useBotSystems } from '../state/botSystems';
import { defaultReactionText, emojiParam, emojiText, parseEmojiInput } from '../state/botEngine';
import { EMOJI_GROUPS, searchEmojis } from '../content/emojis';
import { apiFor, FluxerError, type Endpoints } from '../api/fluxer';
import { uid } from '../utils/factory';
import { intToHex } from '../utils/parse';
import { Badge, Box, Button, Chip, Dialog, EmptyState, FieldButton, FieldButtons, Input, Segmented, useToast } from '../components/ui';
import { Dropdown } from '../components/Dropdown';
import type { ApiChannel, ApiEmoji, ApiGuild, ApiRole, BotSystem, MemberMessageSystem, ReactionEmoji, ReactionRoleMode, ReactionRolePair, ReactionRoleSystem } from '../types';

type Kind = BotSystem['kind'];
type McIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const KINDS: { kind: Kind; icon: McIcon; title: string; text: string }[] = [
  { kind: 'reaction-roles', icon: 'emoticon-plus-outline', title: 'Rôles par réaction', text: 'Les membres réagissent à un message pour obtenir (ou retirer) un rôle.' },
  { kind: 'welcome', icon: 'hand-wave-outline', title: 'Message de bienvenue', text: 'Le bot salue chaque nouveau membre dans un salon.' },
  { kind: 'goodbye', icon: 'exit-run', title: 'Message de départ', text: 'Le bot annonce le départ d’un membre.' },
];
const kindInfo = (k: Kind) => KINDS.find((x) => x.kind === k)!;

const MODES: { value: ReactionRoleMode; label: string; hint: string }[] = [
  { value: 'toggle', label: 'Ajouter et retirer', hint: 'Réagir donne le rôle, retirer sa réaction le retire.' },
  { value: 'add', label: 'Ajouter seulement', hint: 'Réagir donne le rôle ; il reste même si la réaction est retirée.' },
  { value: 'unique', label: 'Un seul rôle', hint: 'Un seul rôle du message à la fois : choisir un rôle retire les autres.' },
];

const TEXT_TYPES = [0, 5];

/** Message d'erreur lisible, avec les permissions à vérifier pour un refus. */
function explain(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof FluxerError && (e.status === 403 || e.status === 50013))
    return `${msg}\n${tr('Vérifie que le bot a les permissions Voir le salon, Envoyer des messages, Ajouter des réactions et Gérer les rôles, et que son rôle est placé au-dessus des rôles à donner.')}`;
  return msg;
}

/** Lien ou ID d'un message : …/channels/<serveur>/<salon>/<message> ou ID seul. */
function parseMessageRef(s: string): { channelId?: string; messageId: string } | null {
  const v = s.trim();
  const m = v.match(/channels\/(?:\d+|@me)\/(\d+)\/(\d+)/);
  if (m) return { channelId: m[1], messageId: m[2] };
  return /^\d{5,}$/.test(v) ? { messageId: v } : null;
}

/* ---------- Données du serveur vues par le bot ---------- */

function useBotGuild(ep: Endpoints, token: string, guildId: string | null) {
  const [guilds, setGuilds] = useState<ApiGuild[] | null>(null);
  const [data, setData] = useState<{ channels: ApiChannel[]; roles: ApiRole[]; emojis: ApiEmoji[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let live = true;
    apiFor(ep, { kind: 'bot', token })
      .guilds()
      .then((g) => {
        if (!live) return;
        setGuilds(g);
        setError(null);
      })
      .catch((e) => live && setError(explain(e)));
    return () => {
      live = false;
    };
  }, [ep, token]);
  useEffect(() => {
    setData(null);
    if (!token || !guildId) return;
    const api = apiFor(ep, { kind: 'bot', token });
    let live = true;
    Promise.all([api.channels(guildId), api.roles(guildId), api.emojis(guildId).catch(() => [] as ApiEmoji[])])
      .then(([channels, roles, emojis]) => {
        if (!live) return;
        setData({ channels, roles, emojis });
        setError(null);
      })
      .catch((e) => live && setError(explain(e)));
    return () => {
      live = false;
    };
  }, [ep, token, guildId]);
  return { guilds, data, error };
}

/* ---------- Choix d'un émoji de réaction ---------- */

function EmojiPicker({ visible, serverEmojis, onClose, onPick }: { visible: boolean; serverEmojis: ApiEmoji[]; onClose: () => void; onPick: (e: ReactionEmoji) => void }) {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const [group, setGroup] = useState(EMOJI_GROUPS[0].key);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (visible) setQ('');
  }, [visible]);
  const found = q.trim() ? searchEmojis(q) : null;
  const list = found ?? EMOJI_GROUPS.find((g) => g.key === group)?.items.map((x) => x.e) ?? [];
  const typed = parseEmojiInput(q);
  const cell = t.z(40);
  return (
    <Dialog visible={visible} onClose={onClose} title="Choisir un émoji" icon="happy-outline" maxWidth={560}>
      <Input value={q} onChangeText={setQ} placeholder="Rechercher, ou coller un émoji / <:nom:id>" autoCapitalize="none" />
      {typed && !found?.length && <Button small icon="checkmark" label={tr('Utiliser {e}', { e: emojiText(typed) })} onPress={() => onPick(typed)} />}
      {serverEmojis.length > 0 && !q && (
        <>
          <Text style={{ color: t.textMuted, fontSize: t.font(12), fontWeight: '700' }}>{tr('Émojis du serveur')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {serverEmojis.slice(0, 60).map((e) => (
              <Pressable key={e.id} onPress={() => onPick({ name: e.name, id: e.id, animated: e.animated })} accessibilityLabel={`:${e.name}:`} style={({ pressed }) => ({ width: cell, height: cell, borderRadius: t.radiusSm, backgroundColor: pressed ? t.accentSoft : t.surface2, alignItems: 'center', justifyContent: 'center' })}>
                <Image source={{ uri: `${ep.media}/emojis/${e.id}.${e.animated ? 'gif' : 'webp'}?size=64` }} style={{ width: t.z(28), height: t.z(28) }} />
              </Pressable>
            ))}
          </View>
        </>
      )}
      {!q && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
          {EMOJI_GROUPS.map((g) => (
            <Pressable key={g.key} onPress={() => setGroup(g.key)} accessibilityLabel={tr(g.label)} style={{ width: t.z(36), height: t.z(36), borderRadius: t.z(12), alignItems: 'center', justifyContent: 'center', backgroundColor: group === g.key ? t.accent : t.surface2 }}>
              <MaterialCommunityIcons name={g.icon as McIcon} size={t.z(19)} color={group === g.key ? t.onAccent : t.textMuted} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <ScrollView style={{ maxHeight: 300 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {list.map((e) => (
            <Pressable key={e} onPress={() => onPick({ name: e })} accessibilityLabel={e} style={({ pressed }) => ({ width: cell, height: cell, borderRadius: t.radiusSm, backgroundColor: pressed ? t.accentSoft : t.surface2, alignItems: 'center', justifyContent: 'center' })}>
              <Text style={{ fontSize: t.font(21) }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Dialog>
  );
}

/* ---------- Éditeur d'un système ---------- */

function SystemEditor({ initial, kind, onDone }: { initial?: BotSystem; kind: Kind; onDone: () => void }) {
  const { theme: t, botToken } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { upsert, device } = useBotSystems();
  const gw = useBotGateway();
  const rr = initial?.kind === 'reaction-roles' ? initial : undefined;
  const mm = initial && initial.kind !== 'reaction-roles' ? initial : undefined;
  const [name, setName] = useState(initial?.name ?? '');
  const [guildId, setGuildId] = useState<string | null>(initial?.guildId ?? null);
  const [channelId, setChannelId] = useState<string | null>(initial?.channelId ?? null);
  const [pairs, setPairs] = useState<ReactionRolePair[]>(rr?.pairs ?? []);
  const [mode, setMode] = useState<ReactionRoleMode>(rr?.mode ?? 'toggle');
  const [source, setSource] = useState<'new' | 'existing'>('new');
  const [ref, setRef] = useState('');
  const [content, setContent] = useState(rr?.content ?? mm?.content ?? (kind === 'welcome' ? tr('Bienvenue {user} sur **{server}** ! 👋') : kind === 'goodbye' ? tr('{username} a quitté le serveur.') : ''));
  const [textEdited, setTextEdited] = useState(!!initial);
  const [picker, setPicker] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { guilds, data, error } = useBotGuild(ep, botToken, guildId);
  const guild = guilds?.find((g) => g.id === guildId);
  const channels = (data?.channels ?? []).filter((c) => TEXT_TYPES.includes(c.type)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const channel = channels.find((c) => c.id === channelId);
  const roles = (data?.roles ?? []).filter((r) => r.name !== '@everyone' && r.id !== guildId).sort((a, b) => b.position - a.position);
  const published = !!rr?.messageId;
  const intro = (m: ReactionRoleMode) => (m === 'add' ? tr('Réagis avec un émoji pour obtenir le rôle correspondant.') : m === 'unique' ? tr('Réagis avec un émoji pour choisir ton rôle (un seul à la fois).') : tr('Réagis avec un émoji pour obtenir le rôle correspondant ; retire ta réaction pour le perdre.'));
  // Texte proposé tant que l'utilisateur ne l'a pas modifié.
  useEffect(() => {
    if (kind !== 'reaction-roles' || textEdited) return;
    setContent(defaultReactionText(pairs, `**${tr('Choisis tes rôles')}**`).replace(/^(.*)\n.*\n/, `$1\n${intro(mode)}\n`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, mode, kind, textEdited]);

  const setPair = (i: number, p: Partial<ReactionRolePair>) => setPairs((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const validPairs = pairs.filter((p) => p.roleId && p.emoji.name);
  const dupEmoji = new Set(validPairs.map((p) => emojiParam(p.emoji))).size !== validPairs.length;
  const canSave =
    !!guildId &&
    !!channelId &&
    (kind === 'reaction-roles' ? validPairs.length > 0 && !dupEmoji && (source === 'new' || published ? !!content.trim() || published : !!parseMessageRef(ref)) : !!content.trim());

  const save = async () => {
    if (!guildId || !channelId) return;
    const base = {
      id: initial?.id ?? uid(),
      name: name.trim() || tr(kindInfo(kind).title),
      enabled: true,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      guildId,
      guildName: guild?.name ?? initial?.guildName,
      channelId,
      channelName: channel?.name ?? initial?.channelName,
    };
    if (kind !== 'reaction-roles') {
      const sys: MemberMessageSystem = { ...base, kind, content: content.trim(), device: mm?.device || device };
      upsert(sys);
      toast(tr('« {name} » activé.', { name: sys.name }), 'success');
      onDone();
      return;
    }
    setBusy(true);
    try {
      const api = apiFor(ep, { kind: 'bot', token: botToken });
      let messageId = rr?.messageId ?? null;
      let ch = channelId;
      if (!messageId) {
        if (source === 'existing') {
          const r = parseMessageRef(ref)!;
          ch = r.channelId ?? channelId;
          await api.message(ch, r.messageId);
          messageId = r.messageId;
        } else messageId = (await api.sendText(channelId, content.trim(), 'none')).id;
      } else if (rr && rr.content !== content.trim() && content.trim()) {
        // Message publié par le bot : son texte est mis à jour.
        await api.editText(channelId, messageId, content.trim()).catch(() => {});
      }
      for (const p of validPairs) {
        await api.addReaction(ch, messageId, emojiParam(p.emoji));
        await new Promise((r) => setTimeout(r, 300));
      }
      const sys: ReactionRoleSystem = { ...base, channelId: ch, kind: 'reaction-roles', mode, pairs: validPairs, messageId, content: content.trim() };
      upsert(sys);
      if (gw.state.state === 'offline') gw.start().catch(() => {});
      toast(tr('« {name} » publié et activé.', { name: sys.name }), 'success');
      onDone();
    } catch (e) {
      Alert.alert(tr('Publication impossible'), explain(e));
    } finally {
      setBusy(false);
    }
  };

  const info = kindInfo(kind);
  return (
    <Box title={initial ? tr('Modifier « {name} »', { name: initial.name }) : tr(info.title)} icon="hardware-chip-outline" collapsible={false}>
      <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>{tr(info.text)}</Text>
      {!!error && <Text style={{ color: t.danger, fontSize: t.font(12) }}>{error}</Text>}
      <Input label="Nom" value={name} onChangeText={setName} placeholder={tr(info.title)} max={60} />
      <Dropdown
        label="Serveur"
        title="Serveur du bot"
        value={guildId}
        loading={!guilds && !error}
        onChange={(v) => {
          setGuildId(v);
          setChannelId(null);
          setPairs([]);
        }}
        options={(guilds ?? []).map((g) => ({ value: g.id, label: g.name }))}
        emptyText="Le bot n’est sur aucun serveur."
      />
      {guildId && (
        <Dropdown
          label="Salon"
          title="Salon"
          value={channelId}
          loading={!data && !error}
          onChange={setChannelId}
          options={channels.map((c) => ({ value: c.id, label: `#${c.name ?? c.id}` }))}
          emptyText="Aucun salon textuel visible par le bot."
        />
      )}

      {kind === 'reaction-roles' && guildId && (
        <>
          <Text style={{ color: t.textMuted, fontSize: t.font(12), fontWeight: '700' }}>{tr('Émojis et rôles')}</Text>
          {pairs.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <Pressable
                onPress={() => setPicker(i)}
                accessibilityRole="button"
                accessibilityLabel={tr('Choisir l’émoji')}
                style={({ pressed }) => ({ width: t.z(48), height: t.z(48), borderRadius: t.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.accentSoft : t.surface2, borderWidth: 1, borderColor: t.border })}
              >
                {p.emoji.id ? (
                  <Image source={{ uri: `${ep.media}/emojis/${p.emoji.id}.${p.emoji.animated ? 'gif' : 'webp'}?size=64` }} style={{ width: t.z(26), height: t.z(26) }} />
                ) : p.emoji.name ? (
                  <Text style={{ fontSize: t.font(22) }}>{p.emoji.name}</Text>
                ) : (
                  <MaterialCommunityIcons name="emoticon-plus-outline" size={t.z(22)} color={t.textFaint} />
                )}
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Dropdown
                  title="Rôle"
                  value={p.roleId || null}
                  placeholder="Choisir un rôle…"
                  onChange={(v) => {
                    const r = roles.find((x) => x.id === v);
                    setPair(i, { roleId: v, roleName: r?.name ?? v, roleColor: r?.color });
                  }}
                  options={roles.map((r) => ({ value: r.id, label: r.name, left: <View style={{ width: t.z(12), height: t.z(12), borderRadius: 6, backgroundColor: r.color ? intToHex(r.color) : t.textFaint }} /> }))}
                  emptyText="Aucun rôle."
                />
              </View>
              <FieldButton icon="trash-outline" label="Retirer" color={t.danger} onPress={() => setPairs((l) => l.filter((_, j) => j !== i))} />
            </View>
          ))}
          {dupEmoji && <Text style={{ color: t.danger, fontSize: t.font(12) }}>{tr('Chaque émoji ne peut servir qu’à un seul rôle.')}</Text>}
          {pairs.length < 20 && <Button small icon="add" label="Ajouter un rôle" onPress={() => setPairs((l) => [...l, { emoji: { name: '' }, roleId: '', roleName: '' }])} />}
          <Text style={{ color: t.textMuted, fontSize: t.font(12), fontWeight: '700' }}>{tr('Comportement')}</Text>
          <Segmented value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label }))} />
          <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr(MODES.find((m) => m.value === mode)!.hint)}</Text>
          {!published && (
            <Segmented
              value={source}
              onChange={setSource}
              options={[
                { value: 'new', label: 'Nouveau message' },
                { value: 'existing', label: 'Message existant' },
              ]}
            />
          )}
          {source === 'existing' && !published ? (
            <Input label="Lien ou ID du message" value={ref} onChangeText={setRef} placeholder="https://web.fluxer.app/channels/…" autoCapitalize="none" mono hint="Le bot y ajoute les réactions ; le message peut venir d’un webhook." />
          ) : (
            <Input
              label={published ? 'Texte du message publié' : 'Texte du message'}
              value={content}
              onChangeText={(v) => {
                setContent(v);
                setTextEdited(true);
              }}
              multiline
              max={2000}
              hint={published ? 'Modifié sur Fluxer à l’enregistrement.' : 'Les mentions de rôles ne notifient personne.'}
            />
          )}
          {published && (
            <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr('Message déjà publié : les nouvelles réactions y seront ajoutées.')}</Text>
          )}
        </>
      )}

      {kind !== 'reaction-roles' && (
        <>
          <Input label="Message" value={content} onChangeText={setContent} multiline max={2000} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[
              ['{user}', 'Mention du membre'],
              ['{username}', 'Nom du membre'],
              ['{server}', 'Nom du serveur'],
            ].map(([v, l]) => (
              <Chip key={v} label={`${v} · ${tr(l)}`} onPress={() => setContent((c) => `${c}${c.endsWith(' ') || !c ? '' : ' '}${v}`)} />
            ))}
          </View>
          <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr('Envoyé par cet appareil uniquement (un seul message même avec plusieurs appareils liés).')}</Text>
        </>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button flex label="Annuler" onPress={onDone} />
        <Button flex variant="primary" icon={kind === 'reaction-roles' && !published ? 'paper-plane-outline' : 'checkmark'} label={kind === 'reaction-roles' && !published ? 'Publier et activer' : 'Enregistrer'} loading={busy} disabled={!canSave || busy} onPress={save} />
      </View>
      <EmojiPicker
        visible={picker !== null}
        serverEmojis={data?.emojis ?? []}
        onClose={() => setPicker(null)}
        onPick={(e) => {
          if (picker !== null) setPair(picker, { emoji: e });
          setPicker(null);
        }}
      />
    </Box>
  );
}

/* ---------- Connexion du bot ---------- */

function BotConnect() {
  const { theme: t, botToken, setBotToken, haptic } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const gw = useBotGateway();
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = gw.state.state;
  if (botToken) {
    const color = st === 'online' ? t.success : st === 'error' ? t.danger : st === 'offline' ? t.textFaint : '#FAA61A';
    const label = st === 'online' ? 'En ligne' : st === 'error' ? 'Erreur' : st === 'offline' ? 'Arrêté' : 'Connexion…';
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.font(14) }}>
            {gw.state.username || tr('Bot Fluxer')} · {tr(label)}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: t.font(12) }}>
            {gw.state.error ||
              (gw.background ? tr('Reste actif app fermée (notification « bot en ligne »).') : tr('Actif tant que FluxerHooks est ouvert (ou réduit dans la zone de notification).'))}
          </Text>
        </View>
        {st === 'offline' || st === 'error' ? <Button small variant="primary" icon="play" label="Démarrer" onPress={() => gw.start().catch(() => {})} /> : <Button small icon="stop" label="Arrêter" onPress={() => gw.stop()} />}
      </View>
    );
  }
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
      toast(tr('Bot « {name} » connecté.', { name: me.username }), 'success');
    } catch (e) {
      haptic('error');
      setError(e instanceof Error ? e.message : tr('Token invalide.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box title="Connecter ton bot" icon="hardware-chip-outline" collapsible={false}>
      <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>
        {tr('Les systèmes du bot ont besoin du token de ton bot Fluxer. Il est vérifié auprès de Fluxer puis stocké chiffré sur cet appareil.')}
      </Text>
      <Input
        value={draft}
        onChangeText={(v) => {
          setDraft(v);
          setError(null);
        }}
        placeholder="Token du bot"
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        mono
        error={error}
        right={
          <FieldButtons>
            <FieldButton mci={show ? 'eye-off-outline' : 'eye-outline'} label={show ? 'Masquer le token' : 'Afficher le token'} onPress={() => setShow((v) => !v)} />
            <FieldButton mci="content-paste" label="Coller le token" onPress={async () => setDraft((await Clipboard.getStringAsync()).trim())} />
          </FieldButtons>
        }
      />
      <Button variant="primary" icon="log-in-outline" label="Connecter le bot" loading={busy} disabled={!draft.trim()} onPress={connect} />
    </Box>
  );
}

/* ---------- Liste ---------- */

export function BotSystems({ query = '' }: { query?: string }) {
  const { theme: t, botToken } = useSettings();
  const { systems, upsert, remove, activity, device } = useBotSystems();
  const toast = useToast();
  const [editing, setEditing] = useState<{ kind: Kind; initial?: BotSystem } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const q = query.trim().toLowerCase();
  const list = useMemo(() => systems.filter((s) => !q || `${s.name} ${s.guildName ?? ''} ${s.channelName ?? ''}`.toLowerCase().includes(q)), [systems, q]);
  const nameOf = (id: string) => systems.find((s) => s.id === id)?.name ?? '—';

  if (editing) return <SystemEditor key={editing.initial?.id ?? editing.kind} kind={editing.kind} initial={editing.initial} onDone={() => setEditing(null)} />;
  return (
    <View style={{ gap: t.gap }}>
      <BotConnect />
      {!!botToken && (
        <>
          {choosing ? (
            <Box title="Nouveau système" icon="add-circle-outline" collapsible={false}>
              {KINDS.map((k) => (
                <Pressable
                  key={k.kind}
                  onPress={() => {
                    setChoosing(false);
                    setEditing({ kind: k.kind });
                  }}
                  accessibilityRole="button"
                  style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radius, borderWidth: 1, borderColor: t.border, backgroundColor: pressed || hovered ? t.accentSoft : t.surface2 })}
                >
                  <View style={{ width: t.z(40), height: t.z(40), borderRadius: t.radiusSm, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name={k.icon} size={t.z(22)} color={t.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: t.text, fontWeight: '800', fontSize: t.font(14) }}>{tr(k.title)}</Text>
                    <Text style={{ color: t.textMuted, fontSize: t.font(12) }}>{tr(k.text)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={t.z(16)} color={t.textFaint} />
                </Pressable>
              ))}
              <Button label="Annuler" onPress={() => setChoosing(false)} />
            </Box>
          ) : (
            <Button variant="primary" icon="add" label="Nouveau système du bot" onPress={() => setChoosing(true)} />
          )}
          {!list.length && !choosing && (
            <EmptyState icon="hardware-chip-outline" title="Aucun système" text="Crée des rôles par réaction, un message de bienvenue ou de départ, exécutés par ton bot." />
          )}
          {list.map((s) => {
            const k = kindInfo(s.kind);
            const detail =
              s.kind === 'reaction-roles'
                ? [s.pairs.map((p) => `${p.emoji.id ? `:${p.emoji.name}:` : p.emoji.name} ${p.roleName}`).join(' · '), tr(MODES.find((m) => m.value === s.mode)!.label)].join(' — ')
                : s.content;
            const elsewhere = s.kind !== 'reaction-roles' && s.device && s.device !== device;
            return (
              <View key={s.id} style={{ gap: 8, padding: 12, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, opacity: s.enabled ? 1 : 0.6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: t.z(38), height: t.z(38), borderRadius: t.radiusSm, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name={k.icon} size={t.z(20)} color={t.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.font(15) }}>{s.name}</Text>
                    <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>
                      {tr(k.title)} · {s.guildName ?? s.guildId} › #{s.channelName ?? s.channelId}
                    </Text>
                  </View>
                  <Switch value={s.enabled} onValueChange={(v) => upsert({ ...s, enabled: v })} trackColor={{ true: t.accent, false: t.surface2 }} thumbColor="#fff" accessibilityLabel={tr(s.enabled ? 'Désactiver' : 'Activer')} />
                </View>
                <Text numberOfLines={2} style={{ color: t.textFaint, fontSize: t.font(12) }}>{detail}</Text>
                {elsewhere && <Badge text={tr('Envoyé par un autre appareil lié')} />}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Button small icon="create-outline" label="Modifier" onPress={() => setEditing({ kind: s.kind, initial: s })} />
                  {elsewhere && <Button small icon="phone-portrait-outline" label="Envoyer depuis cet appareil" onPress={() => upsert({ ...(s as MemberMessageSystem), device })} />}
                  <Button
                    small
                    variant="danger"
                    icon="trash-outline"
                    label="Supprimer"
                    onPress={() =>
                      Alert.alert(tr('Supprimer « {name} » ?', { name: s.name }), tr('Le bot arrête aussitôt ce système (le message publié reste sur Fluxer).'), [
                        { text: tr('Annuler'), style: 'cancel' },
                        {
                          text: tr('Supprimer'),
                          style: 'destructive',
                          onPress: () => {
                            remove(s.id);
                            toast('Système supprimé.', 'success');
                          },
                        },
                      ])
                    }
                  />
                </View>
              </View>
            );
          })}
          {activity.length > 0 && (
            <Box title="Activité récente" icon="pulse-outline" defaultCollapsed>
              {activity.slice(0, 15).map((a, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Ionicons name={a.ok ? 'checkmark-circle' : 'alert-circle'} size={t.z(16)} color={a.ok ? t.success : t.danger} />
                  <Text style={{ flex: 1, color: t.textMuted, fontSize: t.font(12) }}>
                    {new Date(a.at).toLocaleTimeString()} · {nameOf(a.system)} · {a.text}
                  </Text>
                </View>
              ))}
              {Platform.OS !== 'web' && <Text style={{ color: t.textFaint, fontSize: t.font(11) }}>{tr('Sur Android, le bot agit aussi app fermée ; cette liste ne montre que l’activité pendant que l’app est ouverte.')}</Text>}
            </Box>
          )}
        </>
      )}
    </View>
  );
}
