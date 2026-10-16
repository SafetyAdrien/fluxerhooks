import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ColorPickerModal } from './ColorPicker';
import type { Embed, LocalAttachment } from '../types';
import { ImageImportSheet } from './ImageImportSheet';
import { useEditor } from '../state/editor';
import { useSettings } from '../state/settings';
import { EMBED_COLORS } from '../theme/themes';
import { LIMITS, embedLength } from '../utils/limits';
import { hexToInt, intToHex, isAttachmentRef, isHttpUrl, readableOn } from '../utils/parse';
import { Box, Button, FieldButton, FieldButtons, Grid, IconBtn, Input, SectionLabel, Stack, ToggleRow } from './ui';
import { RichInput } from './RichInput';

const urlError = (v: string, allowAttachment = false) =>
  !v.trim() || isHttpUrl(v) || (allowAttachment && isAttachmentRef(v))
    ? null
    : allowAttachment
      ? 'URL http(s) ou attachment://image.png attendue'
      : 'URL http(s) attendue';

function ColorField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { theme: t, settings } = useSettings();
  const [hex, setHex] = useState(intToHex(value));
  const [open, setOpen] = useState(false);
  React.useEffect(() => setHex(intToHex(value)), [value]);
  // Couleurs proposées : récentes d'abord, puis préréglages (sans doublons).
  const swatches = [...settings.recentColors, ...EMBED_COLORS].filter((c, i, a) => a.indexOf(c) === i).slice(0, 14);
  const dot = t.z(34);
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel>Couleur</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable
          onPress={() => onChange(null)}
          accessibilityLabel="Aucune couleur"
          style={{ width: dot, height: dot, borderRadius: dot / 2, borderWidth: 2, borderColor: value === null ? t.accent : t.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={t.z(16)} color={t.textMuted} />
        </Pressable>
        {swatches.map((c) => (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityLabel={`Couleur ${intToHex(c)}`}
            style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: intToHex(c), borderWidth: value === c ? 3 : 1, borderColor: value === c ? t.text : t.border }}
          />
        ))}
      </View>
      <Input
        value={hex}
        onChangeText={(v) => {
          setHex(v);
          const n = hexToInt(v);
          if (n !== null) onChange(n);
          else if (!v.trim()) onChange(null);
        }}
        placeholder="#4641D9"
        autoCapitalize="characters"
        autoCorrect={false}
        mono
        right={
          <FieldButton
            mci="palette-outline"
            label="Ouvrir le sélecteur de couleur"
            onPress={() => setOpen(true)}
            bg={value !== null ? intToHex(value) : undefined}
            color={value !== null ? readableOn(intToHex(value)) : undefined}
          />
        }
      />
      {open && <ColorPickerModal visible value={value} onClose={() => setOpen(false)} onPick={onChange} title="Couleur de l’embed" />}
    </View>
  );
}

export function EmbedEditor({ mid, e, index, count }: { mid: string; e: Embed; index: number; count: number }) {
  const { theme: t } = useSettings();
  const { updateEmbed, removeEmbed, duplicateEmbed, moveEmbed, addField, updateField, removeField, moveField } = useEditor();
  const [collapsed, setCollapsed] = useState(true);
  const { state, updateMessage } = useEditor();
  const [importFor, setImportFor] = useState<'image' | 'thumbnail' | null>(null);
  // Les images importées deviennent des pièces jointes du message, référencées en attachment://.
  const msg = state.messages.find((x) => x.id === mid);
  const onImported = (files: LocalAttachment[]) => {
    if (!msg || !files.length || !importFor) return;
    const slot = importFor;
    // Nom unique pour éviter qu'une image d'embed écrase un fichier du même nom.
    const f = files[0];
    const ext = f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.')) : '.png';
    const name = `${slot}-${e.id.slice(-6)}-${Date.now().toString(36)}${ext}`;
    const file: LocalAttachment = { ...f, name, embedRef: { embedId: e.id, slot } };
    // L'image remplace celle de cet emplacement, elle n'apparaît pas dans les fichiers du message.
    const others = msg.attachments.filter((a) => !(a.embedRef?.embedId === e.id && a.embedRef.slot === slot));
    updateMessage(mid, { attachments: [...others, file].slice(0, LIMITS.attachments) });
    if (slot === 'thumbnail') up({ thumbnail: { url: `attachment://${name}` } });
    else up({ image: { url: `attachment://${name}` } });
  };
  const slotFile = (slot: 'image' | 'thumbnail') => {
    const url = (slot === 'image' ? e.image.url : e.thumbnail.url).trim();
    if (!url.startsWith('attachment://')) return undefined;
    return msg?.attachments.find((a) => a.name === url.slice('attachment://'.length));
  };
  const removeSlot = (slot: 'image' | 'thumbnail') => {
    const f = slotFile(slot);
    if (msg && f?.embedRef) updateMessage(mid, { attachments: msg.attachments.filter((a) => a.id !== f.id) });
    up(slot === 'image' ? { image: { url: '' } } : { thumbnail: { url: '' } });
  };
  const up = (u: Partial<Embed>) => updateEmbed(mid, e.id, u);
  const total = embedLength(e);

  return (
    <Box
      nested
      title={`Embed ${index + 1}${e.title.trim() ? ` — ${e.title.trim()}` : ''}`}
      subtitle={total ? `${total} caractères` : 'Vide'}
      icon="albums"
      accent={e.color !== null ? intToHex(e.color) : undefined}
      collapsed={collapsed}
      onToggle={() => setCollapsed((v) => !v)}
      actions={
        <>
          <IconBtn icon="arrow-up" label="Monter l'embed" onPress={() => moveEmbed(mid, e.id, -1)} disabled={index === 0} size={18} />
          <IconBtn icon="arrow-down" label="Descendre l'embed" onPress={() => moveEmbed(mid, e.id, 1)} disabled={index === count - 1} size={18} />
          <IconBtn icon="copy-outline" label="Dupliquer l'embed" onPress={() => duplicateEmbed(mid, e.id)} disabled={count >= LIMITS.embeds} size={18} />
          <IconBtn icon="trash-outline" label="Supprimer l'embed" color={t.danger} onPress={() => removeEmbed(mid, e.id)} size={18} />
        </>
      }
    >
      <Box title="Auteur" icon="person-circle-outline" defaultCollapsed>
        <RichInput singleLine label="Nom" value={e.author.name} max={LIMITS.authorName} onChange={(v) => up({ author: { ...e.author, name: v } })} placeholder="Nom de l'auteur" />
        <Grid min={220}>
          <Input label="Lien" value={e.author.url} error={urlError(e.author.url)} onChangeText={(v) => up({ author: { ...e.author, url: v } })} placeholder="https://" autoCapitalize="none" keyboardType="url" />
          <Input label="Icône (URL)" value={e.author.icon_url} error={urlError(e.author.icon_url)} onChangeText={(v) => up({ author: { ...e.author, icon_url: v } })} placeholder="https://…/icon.png" autoCapitalize="none" keyboardType="url" />
        </Grid>
      </Box>

      <Box title="Corps" icon="document-text-outline" defaultCollapsed>
        <RichInput singleLine label="Titre" value={e.title} max={LIMITS.embedTitle} onChange={(v) => up({ title: v })} placeholder="Titre de l'embed (markdown)" />
        <Input label="Lien du titre" value={e.url} error={urlError(e.url)} onChangeText={(v) => up({ url: v })} placeholder="https://" autoCapitalize="none" keyboardType="url" />
        <RichInput label="Description" value={e.description} max={LIMITS.embedDescription} onChange={(v) => up({ description: v })} placeholder="Texte de l'embed (markdown, mentions…)" onImportImages={() => setImportFor('image')} />
        <ColorField value={e.color} onChange={(c) => up({ color: c })} />
      </Box>

      <Box title="Champs" icon="grid-outline" defaultCollapsed badge={e.fields.length ? `${e.fields.length}/${LIMITS.fields}` : undefined}>
        {e.fields.map((f, i) => (
          <View key={f.id} style={{ backgroundColor: t.surface, borderRadius: t.radiusSm, padding: 10, gap: 8, borderWidth: 1, borderColor: t.border }}>
            <Stack row gap={2}>
              <Text style={{ flex: 1, color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>Champ {i + 1}</Text>
              <IconBtn icon="arrow-up" label="Monter le champ" size={17} onPress={() => moveField(mid, e.id, f.id, -1)} disabled={i === 0} />
              <IconBtn icon="arrow-down" label="Descendre le champ" size={17} onPress={() => moveField(mid, e.id, f.id, 1)} disabled={i === e.fields.length - 1} />
              <IconBtn icon="close-circle-outline" label="Supprimer le champ" size={18} color={t.danger} onPress={() => removeField(mid, e.id, f.id)} />
            </Stack>
            <RichInput singleLine label="Nom" value={f.name} max={LIMITS.fieldName} onChange={(v) => updateField(mid, e.id, f.id, { name: v })} placeholder="Nom du champ" />
            <RichInput label="Valeur" value={f.value} max={LIMITS.fieldValue} minHeight={60} onChange={(v) => updateField(mid, e.id, f.id, { value: v })} placeholder="Valeur (markdown, mentions…)" />
            <ToggleRow label="En ligne" description="Affiche jusqu'à 3 champs côte à côte" value={f.inline} onChange={(v) => updateField(mid, e.id, f.id, { inline: v })} />
          </View>
        ))}
        <Button icon="add" label="Ajouter un champ" onPress={() => addField(mid, e.id)} disabled={e.fields.length >= LIMITS.fields} />
      </Box>

      <Box title="Images" icon="image-outline" defaultCollapsed>
        {(['image', 'thumbnail'] as const).map((slot) => {
          const url = slot === 'image' ? e.image.url : e.thumbnail.url;
          const file = slotFile(slot);
          return (
            <View key={slot} style={{ gap: 6 }}>
              {file ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: t.radiusSm, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
                  <Image source={{ uri: file.uri }} style={{ width: t.z(slot === 'image' ? 72 : 48), height: t.z(48), borderRadius: 6 }} resizeMode="cover" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: t.text, fontWeight: '700', fontSize: t.font(13) }}>{slot === 'image' ? 'Image de l’embed' : 'Miniature'}</Text>
                    <Text numberOfLines={1} style={{ color: t.textFaint, fontSize: t.font(11) }}>Importée depuis le téléphone</Text>
                  </View>
                  <FieldButtons>
                    <FieldButton mci="image-edit-outline" label="Remplacer" onPress={() => setImportFor(slot)} />
                    <FieldButton icon="trash-outline" label="Retirer" color={t.danger} onPress={() => removeSlot(slot)} />
                  </FieldButtons>
                </View>
              ) : (
                <Input
                  label={slot === 'image' ? 'Image' : 'Miniature'}
                  value={url}
                  error={urlError(url, true)}
                  onChangeText={(v) => up(slot === 'image' ? { image: { url: v } } : { thumbnail: { url: v } })}
                  placeholder="https://… ou importer ↗"
                  autoCapitalize="none"
                  keyboardType="url"
                  right={<FieldButton mci="image-plus-outline" label={slot === 'image' ? 'Importer l’image' : 'Importer la miniature'} onPress={() => setImportFor(slot)} />}
                />
              )}
            </View>
          );
        })}
      </Box>

      <Box title="Pied de page" icon="reorder-two-outline" defaultCollapsed>
        <RichInput singleLine label="Texte" value={e.footer.text} max={LIMITS.footer} onChange={(v) => up({ footer: { ...e.footer, text: v } })} placeholder="Texte du pied de page" />
        <Input label="Icône (URL)" value={e.footer.icon_url} error={urlError(e.footer.icon_url)} onChangeText={(v) => up({ footer: { ...e.footer, icon_url: v } })} placeholder="https://…/icon.png" autoCapitalize="none" keyboardType="url" />
        <SectionLabel>Horodatage</SectionLabel>
        <Input
          value={e.timestamp ?? ''}
          onChangeText={(v) => up({ timestamp: v.trim() ? v : null })}
          placeholder="AAAA-MM-JJTHH:MM:SSZ"
          autoCapitalize="none"
          error={e.timestamp && isNaN(new Date(e.timestamp).getTime()) ? 'Date ISO 8601 invalide' : null}
          mono
        />
        <Stack row wrap gap={8}>
          <Button small icon="time-outline" label="Maintenant" onPress={() => up({ timestamp: new Date().toISOString() })} />
          <Button small icon="calendar-outline" label="Demain" onPress={() => up({ timestamp: new Date(Date.now() + 86400000).toISOString() })} />
          {!!e.timestamp && <Button small variant="ghost" icon="close" label="Retirer" onPress={() => up({ timestamp: null })} />}
        </Stack>
      </Box>
      {total > LIMITS.embedTotal && (
        <Text style={{ color: t.warning, fontSize: t.font(12) }}>
          Attention : {total} caractères au total, au-delà de {LIMITS.embedTotal} l'embed devient difficile à lire.
        </Text>
      )}
      {importFor && (
        <ImageImportSheet
          visible
          single
          title={importFor === 'thumbnail' ? 'Miniature de l’embed' : 'Image de l’embed'}
          confirmLabel="Utiliser cette image"
          onClose={() => setImportFor(null)}
          onConfirm={onImported}
        />
      )}
    </Box>
  );
}
