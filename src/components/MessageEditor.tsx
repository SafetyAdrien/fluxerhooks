import React from 'react';
import { BOT_ENABLED } from '../config';
import { tr } from '../i18n';
import { Alert, Animated, Easing, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import type { DraftMessage, ThreadMode, WebhookInfo } from '../types';
import { useEditor } from '../state/editor';
import { useSettings } from '../state/settings';
import { useSender } from '../state/useSender';
import { useEndpoints } from '../state/useEndpoints';
import { messageLink, isForumType } from '../api/fluxer';
import { LIMITS } from '../utils/limits';
import { formatBytes, isHttpUrl, isSnowflake, parseMessageRef, withAlpha } from '../utils/parse';
import { uid } from '../utils/factory';
import { Box, Button, Chip, IconBtn, Input, SectionLabel, Segmented, Stack, ToggleRow, useToast } from './ui';
import { RichInput } from './RichInput';
import { EmbedEditor } from './EmbedEditor';
import { standaloneAttachments } from '../utils/payload';
import { ImageImportSheet } from './ImageImportSheet';

const FLASH = {
  sent: { label: 'Envoyé', icon: 'check-circle-outline', color: '#23A55A' },
  edited: { label: 'Modifié', icon: 'pencil-circle-outline', color: '#4C8DFF' },
  deleted: { label: 'Supprimé', icon: 'delete-circle-outline', color: '#F23F43' },
} as const;
const FLASH_MS = 5000;

/** Indicateur visible 5 secondes après l'action, puis disparition en fondu. */
function FlashBadge({ flash }: { flash: NonNullable<DraftMessage['flash']> }) {
  const { theme: t } = useSettings();
  const left = FLASH_MS - (Date.now() - flash.at);
  const [gone, setGone] = React.useState(left <= 0);
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (left <= 0) return;
    Animated.spring(anim, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }).start();
    const h = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => setGone(true));
    }, Math.max(0, left - 600));
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (gone) return null;
  const f = FLASH[flash.kind];
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Message ${f.label.toLowerCase()}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: withAlpha(f.color, 0.16),
        borderWidth: 1,
        borderColor: withAlpha(f.color, 0.45),
        opacity: anim,
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
      }}
    >
      <MaterialCommunityIcons name={f.icon} size={t.z(14)} color={f.color} />
      <Text style={{ color: f.color, fontSize: t.font(11), fontWeight: '800' }}>{tr(f.label)}</Text>
    </Animated.View>
  );
}

export function MessageEditor({
  m,
  index,
  count,
  info,
}: {
  m: DraftMessage;
  index: number;
  count: number;
  info?: WebhookInfo;
}) {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { state, updateMessage, removeMessage, duplicateMessage, moveMessage, addEmbed, updateMessage: up } = useEditor();
  const hasBot = BOT_ENABLED && state.targets.some((x) => x.enabled && x.url.startsWith('bot:'));
  const hasHook = state.targets.some((x) => x.enabled && !x.url.startsWith('bot:') && x.url.trim());
  const { busy, sendOne, loadReference, deleteRemote } = useSender();
  const set = (u: Partial<DraftMessage>) => updateMessage(m.id, u);
  const isBusy = busy === m.id;
  // Une destination forum (webhook ou salon du bot) suffit pour proposer titre et tags.
  const forumInfo = [info, ...state.targets.filter((x) => x.enabled).map((x) => x.info)].find((x) => x?.channelType !== undefined && isForumType(x.channelType));
  const forum = !!forumInfo;
  const botForum = !!forumInfo?.bot || state.targets.some((x) => x.enabled && x.info?.bot && isForumType(x.info.channelType ?? 0));
  const tags = forumInfo?.availableTags ?? [];
  const showPost = m.threadMode === 'forum_post' || (botForum && m.threadMode === 'channel');
  const isEdit = !!m.reference.trim();
  const [importing, setImporting] = React.useState(false);
  // Les images d'embed importées restent dans leur embed : on ne liste ici que les fichiers du message.
  const files = standaloneAttachments(m);

  const pickFiles = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      const room = LIMITS.attachments - m.attachments.length;
      const picked = res.assets.slice(0, room).map((a) => ({
        id: uid(),
        uri: a.uri,
        name: a.name.replace(/[^\w.\-]+/g, '_'),
        mimeType: a.mimeType ?? 'application/octet-stream',
        size: a.size ?? 0,
        spoiler: false,
        description: '',
      }));
      if (res.assets.length > room) toast(`Maximum ${LIMITS.attachments} fichiers par message.`, 'error');
      set({ attachments: [...m.attachments, ...picked] });
    } catch (e) {
      toast('Impossible d’ouvrir le sélecteur de fichiers.', 'error');
    }
  };

  const summary = m.content.trim().split('\n')[0].slice(0, 60) || (m.embeds.length ? `${m.embeds.length} embed(s)` : 'Vide');

  return (
    <Box
      title={`Message ${index + 1}${isEdit ? ' · édition' : ''}`}
      subtitle={summary}
      icon={isEdit ? 'create' : 'chatbubble-ellipses'}
      collapsed={m.collapsed}
      onToggle={() => set({ collapsed: !m.collapsed })}
      badgeNode={m.flash ? <FlashBadge key={m.flash.at} flash={m.flash} /> : null}
      actions={
        <>
          <IconBtn icon="arrow-up" label="Monter le message" onPress={() => moveMessage(m.id, -1)} disabled={index === 0} size={18} />
          <IconBtn icon="arrow-down" label="Descendre le message" onPress={() => moveMessage(m.id, 1)} disabled={index === count - 1} size={18} />
          <IconBtn mci="image-plus-outline" icon="image" label="Importer des images" onPress={() => setImporting(true)} size={19} />
          <IconBtn icon="copy-outline" label="Dupliquer le message" onPress={() => duplicateMessage(m.id)} size={18} />
          <IconBtn
            icon="trash-outline"
            label="Supprimer le message"
            color={t.danger}
            size={18}
            onPress={() =>
              Alert.alert('Supprimer ce message du brouillon ?', undefined, [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer', style: 'destructive', onPress: () => removeMessage(m.id) },
              ])
            }
          />
        </>
      }
    >
      <Box
        nested
        title="Contenu" memoryKey={`msg:${m.id}:content`}
        icon="chatbox-ellipses-outline"
        subtitle={m.content.trim() ? `${m.content.trim().split('\n')[0].slice(0, 60)}` : undefined}
        badge={m.content.length ? `${m.content.length}/${LIMITS.content}` : undefined}
        defaultCollapsed
      >
        <RichInput
          value={m.content}
          max={LIMITS.content}
          onChange={(v) => set({ content: v })}
          placeholder="Écris ton message… (markdown, @ pour les mentions)"
          onImportImages={() => setImporting(true)}
        />
      </Box>

      <Box nested title="Profil" memoryKey={`msg:${m.id}:profile`} icon="person-outline" subtitle={m.username.trim() || info?.name || 'Nom et avatar par défaut'} defaultCollapsed>
        {hasBot && (
          <Text style={{ color: t.textMuted, fontSize: t.font(12) }}>
            {tr("Les salons du bot utilisent toujours le nom et l’avatar du bot ; ces réglages s’appliquent aux webhooks.")}
          </Text>
        )}
        <Input label="Nom affiché" value={m.username} max={LIMITS.username} onChangeText={(v) => set({ username: v })} placeholder={info?.name ?? 'Nom du webhook'} />
        <Input
          label="Avatar (URL)"
          value={m.avatar_url}
          error={m.avatar_url.trim() && !isHttpUrl(m.avatar_url) ? 'URL http(s) attendue' : null}
          onChangeText={(v) => set({ avatar_url: v })}
          placeholder="https://…/avatar.png"
          autoCapitalize="none"
          keyboardType="url"
        />
      </Box>

      <Box
        nested
        title="Destination" memoryKey={`msg:${m.id}:dest`}
        icon="git-branch-outline"
        subtitle={m.threadMode === 'channel' ? (botForum ? `Nouveau post : ${m.thread_name || '—'}` : 'Salon de la destination') : m.threadMode === 'thread' ? `Thread ${m.thread_id || '—'}` : `Nouveau post : ${m.thread_name || '—'}`}
        defaultCollapsed
      >
        <Segmented<ThreadMode>
          value={m.threadMode}
          onChange={(v) => set({ threadMode: v })}
          options={[
            { value: 'channel', label: 'Salon', icon: 'chatbox-outline' },
            { value: 'thread', label: 'Thread', icon: 'git-merge-outline' },
            { value: 'forum_post', label: 'Forum', icon: 'chatbubbles-outline' },
          ]}
        />
        {forum && m.threadMode === 'channel' && (
          <Text style={{ color: botForum ? t.textMuted : t.warning, fontSize: t.font(12) }}>
            {botForum
              ? `« ${forumInfo?.channelName ?? 'Forum'} » est un forum : le bot y créera un nouveau post avec ce titre et ces tags.`
              : 'Ce webhook pointe vers un forum : choisis « Forum » pour créer un post, ou « Thread » pour répondre dans un post existant.'}
          </Text>
        )}
        {m.threadMode === 'thread' && (
          <Input
            label="ID du thread / post"
            value={m.thread_id}
            onChangeText={(v) => set({ thread_id: v.replace(/\D/g, '') })}
            error={m.thread_id && !isSnowflake(m.thread_id) ? 'ID numérique attendu' : null}
            hint="Le message sera publié dans ce thread (il est désarchivé automatiquement)."
            keyboardType="number-pad"
            mono
          />
        )}
        {showPost && (
          <>
            <Input label="Titre du post" value={m.thread_name} max={LIMITS.threadName} onChangeText={(v) => set({ thread_name: v })} placeholder="Titre du nouveau post" />
            <SectionLabel right={<Text style={{ color: t.textFaint, fontSize: t.font(11) }}>{m.applied_tags.length}/{LIMITS.appliedTags}</Text>}>
              Tags
            </SectionLabel>
            {tags.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tags.map((tag) => {
                  const on = m.applied_tags.includes(tag.id);
                  return (
                    <Chip
                      key={tag.id}
                      label={`${tag.emoji_name ? tag.emoji_name + ' ' : ''}${tag.name}${tag.moderated ? ' 🔒' : ''}`}
                      selected={on}
                      onPress={() =>
                        set({
                          applied_tags: on
                            ? m.applied_tags.filter((x) => x !== tag.id)
                            : m.applied_tags.length < LIMITS.appliedTags
                              ? [...m.applied_tags, tag.id]
                              : m.applied_tags,
                        })
                      }
                    />
                  );
                })}
              </View>
            ) : (
              <Input
                value={m.applied_tags.join(', ')}
                onChangeText={(v) => set({ applied_tags: v.split(/[\s,]+/).filter(Boolean).slice(0, LIMITS.appliedTags) })}
                placeholder="IDs des tags séparés par des virgules"
                hint="Connecte un bot dans les paramètres pour choisir les tags dans une liste."
                keyboardType="numbers-and-punctuation"
                mono
              />
            )}
          </>
        )}
      </Box>

      <Box nested title="Embeds" memoryKey={`msg:${m.id}:embeds`} icon="albums-outline" badge={`${m.embeds.length}/${LIMITS.embeds}`} defaultCollapsed>
        {m.embeds.map((e, i) => (
          <EmbedEditor key={e.id} mid={m.id} e={e} index={i} count={m.embeds.length} />
        ))}
        <Button icon="add-circle-outline" label="Ajouter un embed" onPress={() => addEmbed(m.id)} disabled={m.embeds.length >= LIMITS.embeds} />
      </Box>

      <Box nested title="Fichiers du message" memoryKey={`msg:${m.id}:files`} icon="attach" badge={files.length ? String(files.length) : undefined} defaultCollapsed>
        {isEdit && <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr("Les fichiers ne sont envoyés qu’avec un nouveau message.")}</Text>}
        {files.map((a) => (
          <View key={a.id} style={{ backgroundColor: t.surface, borderRadius: t.radiusSm, padding: 10, gap: 6, borderWidth: 1, borderColor: t.border }}>
            <Stack row gap={6}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600' }}>{a.name}</Text>
                <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>
                  {formatBytes(a.size)} · {a.mimeType}
                </Text>
              </View>
              <IconBtn
                icon="code-outline"
                label="Copier la référence attachment://"
                onPress={async () => {
                  await Clipboard.setStringAsync(`attachment://${a.name}`);
                  toast('Référence copiée : colle-la dans l’image d’un embed.', 'success');
                }}
              />
              <IconBtn icon="close-circle-outline" label="Retirer le fichier" color={t.danger} onPress={() => set({ attachments: m.attachments.filter((x) => x.id !== a.id) })} />
            </Stack>
            <ToggleRow label="Spoiler" value={a.spoiler} onChange={(v) => set({ attachments: m.attachments.map((x) => (x.id === a.id ? { ...x, spoiler: v } : x)) })} />
            <Input
              value={a.description}
              onChangeText={(v) => set({ attachments: m.attachments.map((x) => (x.id === a.id ? { ...x, description: v } : x)) })}
              placeholder="Texte alternatif (accessibilité)"
            />
          </View>
        ))}
        <Stack row gap={8}>
          <Button flex mci="image-plus-outline" label="Images" onPress={() => setImporting(true)} disabled={m.attachments.length >= LIMITS.attachments} />
          <Button flex mci="paperclip-plus" label="Fichiers" onPress={pickFiles} disabled={m.attachments.length >= LIMITS.attachments} />
        </Stack>
      </Box>

      <Box nested title="Options" memoryKey={`msg:${m.id}:options`} icon="options-outline" defaultCollapsed>
        <ToggleRow icon="eye-off-outline" label="Masquer les embeds" description="Drapeau SUPPRESS_EMBEDS" value={m.suppressEmbeds} onChange={(v) => set({ suppressEmbeds: v })} />
        <ToggleRow icon="notifications-off-outline" label="Message silencieux" description="Aucune notification de mention" value={m.suppressNotifications} onChange={(v) => set({ suppressNotifications: v })} />
        <SectionLabel>Mentions autorisées</SectionLabel>
        <Segmented
          value={m.mentions}
          onChange={(v) => set({ mentions: v })}
          options={[
            { value: 'none', label: 'Aucune' },
            { value: 'users', label: 'Membres' },
            { value: 'users_roles', label: '+ Rôles' },
            { value: 'all', label: 'Toutes' },
          ]}
        />
        <Input
          label="Répondre au message (ID)"
          value={m.reply_to}
          onChangeText={(v) => set({ reply_to: v.replace(/\D/g, '') })}
          placeholder="ID d'un message du même salon"
          keyboardType="number-pad"
          mono
        />
      </Box>

      <Box nested title="Modifier un message envoyé" memoryKey={`msg:${m.id}:edit`} icon="create-outline" subtitle={isEdit ? 'Mode édition actif' : 'Lien ou ID du message'} defaultCollapsed>
        <Input
          value={m.reference}
          onChangeText={(v) => set({ reference: v })}
          placeholder="https://web.fluxer.app/channels/…/…/… ou ID"
          error={m.reference.trim() && !parseMessageRef(m.reference) ? 'Lien ou ID invalide' : null}
          hint="Le message doit avoir été envoyé par ce webhook. Pour un thread, règle aussi la destination."
          autoCapitalize="none"
        />
        {isEdit && (
          <Stack row wrap gap={8}>
            <Button small icon="download-outline" label="Charger le contenu" onPress={() => loadReference(m)} loading={isBusy} />
            <Button small variant="danger" icon="trash-outline" label="Supprimer sur Fluxer" onPress={() => deleteRemote(m, m.reference)} />
            <Button small variant="ghost" icon="close" label="Quitter l'édition" onPress={() => set({ reference: '' })} />
          </Stack>
        )}
      </Box>

      {m.lastSent && (
        <View style={{ backgroundColor: t.accentSoft, borderRadius: t.radiusSm, padding: 10, gap: 8 }}>
          <Text style={{ color: t.text, fontSize: t.font(13) }}>
            {tr("Envoyé · ID")} <Text style={{ fontWeight: '700' }}>{m.lastSent.messageId}</Text>
          </Text>
          <Stack row wrap gap={8}>
            <Button small icon="create-outline" label="Éditer ce message" onPress={() => up(m.id, { reference: m.lastSent!.messageId })} />
            <Button
              small
              icon="link-outline"
              label="Copier le lien"
              onPress={async () => {
                await Clipboard.setStringAsync(
                  info ? messageLink(ep, info.guild_id, m.lastSent!.channelId, m.lastSent!.messageId) : m.lastSent!.messageId,
                );
                toast('Lien copié.', 'success');
              }}
            />
            <Button small variant="ghost" icon="trash-outline" label="Supprimer" onPress={() => deleteRemote(m, m.lastSent!.messageId)} />
          </Stack>
        </View>
      )}

      <Button
        variant="primary"
        icon={isEdit ? 'save-outline' : 'paper-plane'}
        label={isEdit ? 'Mettre à jour ce message' : 'Envoyer ce message'}
        onPress={() => sendOne(m)}
        loading={isBusy}
      />
      {importing && (
        <ImageImportSheet
          visible
          onClose={() => setImporting(false)}
          onConfirm={(files) => set({ attachments: [...m.attachments, ...files].slice(0, LIMITS.attachments) })}
        />
      )}
    </Box>
  );
}
