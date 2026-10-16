import React from 'react';
import { Alert, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import type { DraftMessage, ThreadMode, WebhookInfo } from '../types';
import { useEditor } from '../state/editor';
import { useSettings } from '../state/settings';
import { useSender } from '../state/useSender';
import { useEndpoints } from '../state/useEndpoints';
import { messageLink, isForumType } from '../api/fluxer';
import { LIMITS } from '../utils/limits';
import { formatBytes, isHttpUrl, isSnowflake, parseMessageRef } from '../utils/parse';
import { uid } from '../utils/factory';
import { Box, Button, Chip, IconBtn, Input, SectionLabel, Segmented, Stack, ToggleRow, useToast } from './ui';
import { RichInput } from './RichInput';
import { EmbedEditor } from './EmbedEditor';
import { ImageImportSheet } from './ImageImportSheet';

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
  const { updateMessage, removeMessage, duplicateMessage, moveMessage, addEmbed, updateMessage: up } = useEditor();
  const { busy, sendOne, loadReference, deleteRemote } = useSender();
  const set = (u: Partial<DraftMessage>) => updateMessage(m.id, u);
  const isBusy = busy === m.id;
  const forum = info?.channelType !== undefined && isForumType(info.channelType);
  const tags = info?.availableTags ?? [];
  const isEdit = !!m.reference.trim();
  const [importing, setImporting] = React.useState(false);

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
      badge={m.lastSent ? 'Envoyé' : undefined}
      actions={
        <>
          <IconBtn icon="arrow-up" label="Monter le message" onPress={() => moveMessage(m.id, -1)} disabled={index === 0} size={18} />
          <IconBtn icon="arrow-down" label="Descendre le message" onPress={() => moveMessage(m.id, 1)} disabled={index === count - 1} size={18} />
          <IconBtn icon="images-outline" label="Importer des images" onPress={() => setImporting(true)} size={18} />
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
      <RichInput
        label="Contenu"
        value={m.content}
        max={LIMITS.content}
        onChange={(v) => set({ content: v })}
        placeholder="Écris ton message… (markdown, @ pour les mentions)"
        onImportImages={() => setImporting(true)}
      />

      <Box nested title="Profil du webhook" icon="person-outline" subtitle={m.username.trim() || info?.name || 'Nom et avatar par défaut'} defaultCollapsed={!m.username && !m.avatar_url}>
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
        title="Destination"
        icon="git-branch-outline"
        subtitle={m.threadMode === 'channel' ? 'Salon du webhook' : m.threadMode === 'thread' ? `Thread ${m.thread_id || '—'}` : `Nouveau post : ${m.thread_name || '—'}`}
        defaultCollapsed={m.threadMode === 'channel' && !forum}
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
          <Text style={{ color: t.warning, fontSize: t.font(12) }}>
            Ce webhook pointe vers un forum : choisis « Forum » pour créer un post, ou « Thread » pour répondre dans un post existant.
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
        {m.threadMode === 'forum_post' && (
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

      <SectionLabel right={<Text style={{ color: t.textFaint, fontSize: t.font(11) }}>{m.embeds.length}/{LIMITS.embeds}</Text>}>Embeds</SectionLabel>
      {m.embeds.map((e, i) => (
        <EmbedEditor key={e.id} mid={m.id} e={e} index={i} count={m.embeds.length} />
      ))}
      <Button icon="add-circle-outline" label="Ajouter un embed" onPress={() => addEmbed(m.id)} disabled={m.embeds.length >= LIMITS.embeds} />

      <Box nested title="Fichiers" icon="attach" badge={m.attachments.length ? String(m.attachments.length) : undefined} defaultCollapsed={!m.attachments.length}>
        {isEdit && <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>Les fichiers ne sont envoyés qu’avec un nouveau message.</Text>}
        {m.attachments.map((a) => (
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
          <Button flex icon="images-outline" label="Images" onPress={() => setImporting(true)} disabled={m.attachments.length >= LIMITS.attachments} />
          <Button flex icon="document-attach-outline" label="Fichiers" onPress={pickFiles} disabled={m.attachments.length >= LIMITS.attachments} />
        </Stack>
      </Box>

      <Box nested title="Options" icon="options-outline" defaultCollapsed>
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

      <Box nested title="Modifier un message envoyé" icon="create-outline" subtitle={isEdit ? 'Mode édition actif' : 'Lien ou ID du message'} defaultCollapsed={!isEdit}>
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
            Envoyé · ID <Text style={{ fontWeight: '700' }}>{m.lastSent.messageId}</Text>
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
