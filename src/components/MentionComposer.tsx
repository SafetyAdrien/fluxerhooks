import React, { useEffect, useMemo, useState } from 'react';
import { tr } from '../i18n';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { EMOJI_GROUPS, searchEmojis } from '../content/emojis';
import { getUi, setUi } from '../state/uiMemory';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { useEditor } from '../state/editor';
import { useEndpoints } from '../state/useEndpoints';
import { orderChannels, THREAD_TYPES } from '../utils/channels';
import { intToHex } from '../utils/parse';
import { Button, Chip, Dialog, EmptyState, Input, ListRow, SectionLabel, Stack } from './ui';
import { ChannelIcon, Dropdown, channelTypeLabel } from './Dropdown';

type Tab = 'channels' | 'roles' | 'users' | 'emojis' | 'time' | 'special';

const TIME_STYLES = [
  { s: 't', label: 'Heure courte' },
  { s: 'T', label: 'Heure longue' },
  { s: 'd', label: 'Date courte' },
  { s: 'D', label: 'Date longue' },
  { s: 'f', label: 'Date et heure' },
  { s: 'F', label: 'Date complète' },
  { s: 'R', label: 'Relatif' },
];

const QUICK_EMOJIS = ['✅', '❌', '⚠️', '📢', '📌', '🎉', '🔥', '💡', '❤️', '👍', '👋', '⭐', '🚀', '🛡️', '📜', '🎮', '🎨', '🔔', '📅', '💬'];

function previewTime(unix: number, s: string): string {
  const d = new Date(unix * 1000);
  if (isNaN(d.getTime())) return '—';
  switch (s) {
    case 't':
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    case 'T':
      return d.toLocaleTimeString('fr-FR');
    case 'd':
      return d.toLocaleDateString('fr-FR');
    case 'D':
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    case 'F':
      return d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    case 'R': {
      const diff = Math.round((unix * 1000 - Date.now()) / 60000);
      return diff >= 0 ? `dans ${diff} min` : `il y a ${-diff} min`;
    }
    default:
      return d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Compositeur de mentions et d'éléments spéciaux : #salons, @rôles, @membres,
 * émojis du serveur, horodatages <t:…> et liens de navigation.
 */
export function MentionComposer({ visible, onClose, onInsert }: { visible: boolean; onClose: () => void; onInsert: (text: string) => void }) {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const session = useSession();
  const { state } = useEditor();
  // Les émojis s'ouvrent par défaut (les plus utilisés) ; mentions et horodatages juste à côté.
  const [tab, setTab] = useState<Tab>('emojis');
  const [emojiGroup, setEmojiGroup] = useState<string>('recent');
  const [manualId, setManualId] = useState('');
  const [q, setQ] = useState('');
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 3600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  });

  const webhookGuild = state.targets.find((x) => x.info)?.info?.guild_id ?? null;
  const [guildId, setGuildId] = useState<string | null>(webhookGuild);
  const source = session.defaultSource;
  const guilds = source ? session.guilds[source] : [];
  const data = guildId ? session.guildData[guildId] : undefined;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !source) return;
    session.loadGuilds(source).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, source]);
  useEffect(() => {
    if (webhookGuild && !guildId) setGuildId(webhookGuild);
  }, [webhookGuild, guildId]);
  useEffect(() => {
    if (!visible || !source || !guildId) return;
    setLoading(true);
    session.loadGuild(source, guildId).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, source, guildId]);

  const insert = (s: string) => {
    onInsert(s);
    onClose();
  };
  const insertEmoji = (e: string) => {
    setUi('emoji:recent', [e, ...getUi<string[]>('emoji:recent', []).filter((x) => x !== e)].slice(0, 24));
    insert(e);
  };

  const unix = useMemo(() => {
    const m = when.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (!m) return NaN;
    return Math.floor(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])).getTime() / 1000);
  }, [when]);

  const ql = q.trim().toLowerCase();
  const match = (s?: string) => !ql || (s ?? '').toLowerCase().includes(ql);

  const needGuild = ['channels', 'roles', 'emojis'].includes(tab);
  let body: React.ReactNode = null;

  if (needGuild && !source && tab !== 'emojis') {
    body = (
      <EmptyState
        icon="person-circle-outline"
        title="Liste indisponible"
        text="Connecte ton compte Fluxer ou un bot pour choisir dans la liste. Tu peux aussi saisir un ID ci-dessous."
      />
    );
  } else if (tab === 'channels' && data) {
    const entries = orderChannels(data.channels, data.threads, { types: [0, 2, 5, 15, 16, ...THREAD_TYPES], withThreads: true }).filter((e) => match(e.channel.name));
    let lastGroup = '§';
    body = entries.map((e) => {
      const header = e.group !== lastGroup ? ((lastGroup = e.group), e.group) : null;
      return (
        <View key={e.channel.id}>
          {header !== null && !!header && <SectionLabel>{header}</SectionLabel>}
          <ListRow
            title={e.channel.name ?? e.channel.id}
            subtitle={channelTypeLabel(e.channel.type)}
            left={<View style={{ marginLeft: e.indent * t.z(18) }}><ChannelIcon type={e.channel.type} /></View>}
            onPress={() => insert(`<#${e.channel.id}>`)}
          />
        </View>
      );
    });
  } else if (tab === 'roles' && data) {
    body = (
      <>
        <Stack row gap={8}>
          <Button flex small label="@everyone" onPress={() => insert('@everyone')} />
          <Button flex small label="@here" onPress={() => insert('@here')} />
        </Stack>
        {[...data.roles]
          .sort((a, b) => b.position - a.position)
          .filter((r) => r.name !== '@everyone' && match(r.name))
          .map((r) => (
            <ListRow
              key={r.id}
              title={r.name}
              left={<View style={{ width: t.z(14), height: t.z(14), borderRadius: 7, backgroundColor: r.color ? intToHex(r.color) : t.textFaint }} />}
              onPress={() => insert(`<@&${r.id}>`)}
            />
          ))}
        {!data.roles.length && <Text style={{ color: t.textMuted }}>{tr("Aucun rôle visible.")}</Text>}
      </>
    );
  } else if (tab === 'emojis') {
    const recent = getUi<string[]>('emoji:recent', []);
    const found = ql ? searchEmojis(ql) : null;
    const group = EMOJI_GROUPS.find((g) => g.key === emojiGroup);
    // Sans historique, « Récents » propose les émojis les plus courants.
    const list = found ?? (emojiGroup === 'recent' ? (recent.length ? recent : QUICK_EMOJIS) : group?.items.map((x) => x.e) ?? []);
    const cell = t.z(42);
    body = (
      <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
          {[{ key: 'recent', label: 'Récents', icon: 'history' }, ...EMOJI_GROUPS].map((g) => {
            const on = !found && emojiGroup === g.key;
            return (
              <Pressable
                key={g.key}
                onPress={() => {
                  setQ('');
                  setEmojiGroup(g.key);
                }}
                accessibilityRole="button"
                accessibilityLabel={tr(g.label)}
                accessibilityState={{ selected: on }}
                style={({ pressed }) => ({ width: t.z(38), height: t.z(38), borderRadius: t.z(12), alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : pressed ? t.accentSoft : t.surface2 })}
              >
                <MaterialCommunityIcons name={g.icon as any} size={t.z(20)} color={on ? t.onAccent : t.textMuted} />
              </Pressable>
            );
          })}
        </ScrollView>
        <SectionLabel>{found ? tr('Résultats ({n})', { n: found.length }) : emojiGroup === 'recent' ? (recent.length ? 'Récents' : 'Populaires') : group?.label ?? ''}</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {list.map((e) => (
            <Pressable
              key={e}
              onPress={() => insertEmoji(e)}
              accessibilityLabel={e}
              style={({ pressed, hovered }: any) => ({ width: cell, height: cell, borderRadius: t.radiusSm, backgroundColor: pressed || hovered ? t.accentSoft : t.surface2, alignItems: 'center', justifyContent: 'center' })}
            >
              <Text style={{ fontSize: t.font(22) }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        {!list.length && <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>{found ? tr('Aucun émoji trouvé.') : tr('Les émojis utilisés apparaîtront ici.')}</Text>}
        {data && data.emojis.filter((e) => match(e.name)).length > 0 && (
          <>
            <SectionLabel>Émojis du serveur ({data.emojis.length})</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {data.emojis
                .filter((e) => match(e.name))
                .map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => insert(`<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`)}
                    accessibilityLabel={`:${e.name}:`}
                    style={{ width: t.z(48), height: t.z(48), borderRadius: t.radiusSm, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Image source={{ uri: `${ep.media}/emojis/${e.id}.${e.animated ? 'gif' : 'webp'}?size=64` }} style={{ width: t.z(32), height: t.z(32) }} />
                  </Pressable>
                ))}
            </View>
          </>
        )}
      </>
    );
  } else if (tab === 'users') {
    body = (
      <>
        {session.user && (
          <ListRow icon="person-circle-outline" title={`Moi (${session.user.global_name || session.user.username})`} onPress={() => insert(`<@${session.user!.id}>`)} />
        )}
        {session.botUser && <ListRow icon="hardware-chip-outline" title={`Le bot (${session.botUser.username})`} onPress={() => insert(`<@${session.botUser!.id}>`)} />}
        <Text style={{ color: t.textMuted, fontSize: t.font(12) }}>
          {tr("Pour mentionner un membre, colle son ID (clic droit / appui long sur son profil dans Fluxer → Copier l’ID).")}
        </Text>
      </>
    );
  } else if (tab === 'time') {
    body = (
      <>
        <Input label="Date et heure" value={when} onChangeText={setWhen} placeholder="JJ/MM/AAAA HH:MM" error={isNaN(unix) ? 'Format JJ/MM/AAAA HH:MM' : null} keyboardType="numbers-and-punctuation" mono />
        <Stack row wrap gap={6}>
          <Chip label="Maintenant" onPress={() => setWhen(new Date().toLocaleDateString('fr-FR') + ' ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))} />
        </Stack>
        {!isNaN(unix) &&
          TIME_STYLES.map((s) => (
            <ListRow key={s.s} icon="time-outline" title={previewTime(unix, s.s)} subtitle={`${s.label} · <t:${unix}:${s.s}>`} onPress={() => insert(`<t:${unix}:${s.s}>`)} />
          ))}
      </>
    );
  } else if (tab === 'special') {
    body = (
      <>
        <ListRow icon="compass-outline" title="Parcourir les salons" subtitle="<id:browse>" onPress={() => insert('<id:browse>')} />
        <ListRow icon="options-outline" title="Salons et rôles" subtitle="<id:customize>" onPress={() => insert('<id:customize>')} />
        <ListRow icon="book-outline" title="Guide du serveur" subtitle="<id:guide>" onPress={() => insert('<id:guide>')} />
        <ListRow icon="happy-outline" title="Mention de l’auteur d’une réponse" subtitle="Active « Mentions » dans Options" />
      </>
    );
  } else if (needGuild && !guildId) {
    body = <Text style={{ color: t.textMuted, textAlign: 'center', padding: 12 }}>{tr("Choisis un serveur.")}</Text>;
  } else if (needGuild && loading) {
    body = <Text style={{ color: t.textMuted, textAlign: 'center', padding: 12 }}>{tr("Chargement…")}</Text>;
  }

  const prefix = tab === 'channels' ? '#' : tab === 'roles' ? '@&' : tab === 'users' ? '@' : null;

  return (
    <Dialog visible={visible} onClose={onClose} title="Insérer" icon="at">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(
          [
            ['emojis', 'Émojis', 'happy-outline'],
            ['channels', 'Salons', 'chatbox-outline'],
            ['roles', 'Rôles', 'shield-outline'],
            ['users', 'Membres', 'person-outline'],
            ['time', 'Horodatage', 'time-outline'],
            ['special', 'Navigation', 'compass-outline'],
          ] as const
        ).map(([k, label, icon]) => (
          <Chip key={k} label={label} icon={icon} selected={tab === k} onPress={() => setTab(k)} />
        ))}
      </View>
      {needGuild && source && guilds.length > 0 && (tab !== 'emojis' || data) && (
        <Dropdown
          label="Serveur"
          value={guildId}
          onChange={setGuildId}
          options={guilds.map((g) => ({ value: g.id, label: g.name, subtitle: g.id === webhookGuild ? 'Serveur du webhook' : undefined }))}
        />
      )}
      {(tab === 'emojis' || (['channels', 'roles'].includes(tab) && data)) && (
        <Input value={q} onChangeText={setQ} placeholder="Rechercher…" autoCapitalize="none" right={<Ionicons name="search" size={t.z(18)} color={t.textFaint} />} />
      )}
      {body}
      {prefix && (
        <View style={{ gap: 6, marginTop: 6 }}>
          <SectionLabel>Saisir un ID</SectionLabel>
          <Stack row gap={8}>
            <View style={{ flex: 1 }}>
              <Input value={manualId} onChangeText={(v) => setManualId(v.replace(/\D/g, ''))} placeholder="ID numérique" keyboardType="number-pad" mono />
            </View>
            <Button
              variant="primary"
              icon="return-down-forward"
              disabled={manualId.length < 5}
              onPress={() => insert(prefix === '#' ? `<#${manualId}>` : prefix === '@&' ? `<@&${manualId}>` : `<@${manualId}>`)}
            />
          </Stack>
        </View>
      )}
    </Dialog>
  );
}
