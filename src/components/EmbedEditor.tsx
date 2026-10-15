import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Embed } from '../types';
import { useEditor } from '../state/editor';
import { useSettings } from '../state/settings';
import { EMBED_COLORS } from '../theme/themes';
import { LIMITS, embedLength } from '../utils/limits';
import { hexToInt, intToHex, isAttachmentRef, isHttpUrl } from '../utils/parse';
import { Box, Button, Grid, IconBtn, Input, SectionLabel, Stack, ToggleRow } from './ui';
import { RichInput } from './RichInput';

const urlError = (v: string, allowAttachment = false) =>
  !v.trim() || isHttpUrl(v) || (allowAttachment && isAttachmentRef(v))
    ? null
    : allowAttachment
      ? 'URL http(s) ou attachment://image.png attendue'
      : 'URL http(s) attendue';

function ColorPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const { theme: t } = useSettings();
  const [hex, setHex] = useState(intToHex(value));
  React.useEffect(() => setHex(intToHex(value)), [value]);
  return (
    <View style={{ gap: 8 }}>
      <SectionLabel>Couleur</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable
          onPress={() => onChange(null)}
          accessibilityLabel="Aucune couleur"
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            borderWidth: 2,
            borderColor: value === null ? t.accent : t.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={16} color={t.textMuted} />
        </Pressable>
        {EMBED_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => onChange(c)}
            accessibilityLabel={`Couleur ${intToHex(c)}`}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: intToHex(c),
              borderWidth: value === c ? 3 : 1,
              borderColor: value === c ? t.text : t.border,
            }}
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
        right={<View style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: value !== null ? intToHex(value) : 'transparent', borderWidth: 1, borderColor: t.border }} />}
      />
    </View>
  );
}

export function EmbedEditor({ mid, e, index, count }: { mid: string; e: Embed; index: number; count: number }) {
  const { theme: t } = useSettings();
  const { updateEmbed, removeEmbed, duplicateEmbed, moveEmbed, addField, updateField, removeField, moveField } = useEditor();
  const [collapsed, setCollapsed] = useState(false);
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
      <Box title="Auteur" icon="person-circle-outline" defaultCollapsed={!e.author.name}>
        <Input label="Nom" value={e.author.name} max={LIMITS.authorName} onChangeText={(v) => up({ author: { ...e.author, name: v } })} placeholder="Nom de l'auteur" />
        <Grid min={220}>
          <Input label="Lien" value={e.author.url} error={urlError(e.author.url)} onChangeText={(v) => up({ author: { ...e.author, url: v } })} placeholder="https://" autoCapitalize="none" keyboardType="url" />
          <Input label="Icône (URL)" value={e.author.icon_url} error={urlError(e.author.icon_url)} onChangeText={(v) => up({ author: { ...e.author, icon_url: v } })} placeholder="https://…/icon.png" autoCapitalize="none" keyboardType="url" />
        </Grid>
      </Box>

      <Box title="Corps" icon="document-text-outline">
        <Input label="Titre" value={e.title} max={LIMITS.embedTitle} onChangeText={(v) => up({ title: v })} placeholder="Titre de l'embed" />
        <Input label="Lien du titre" value={e.url} error={urlError(e.url)} onChangeText={(v) => up({ url: v })} placeholder="https://" autoCapitalize="none" keyboardType="url" />
        <RichInput label="Description" value={e.description} max={LIMITS.embedDescription} onChange={(v) => up({ description: v })} placeholder="Texte de l'embed (markdown accepté)" />
        <ColorPicker value={e.color} onChange={(c) => up({ color: c })} />
      </Box>

      <Box title="Champs" icon="grid-outline" defaultCollapsed={!e.fields.length} badge={e.fields.length ? `${e.fields.length}/${LIMITS.fields}` : undefined}>
        {e.fields.map((f, i) => (
          <View key={f.id} style={{ backgroundColor: t.surface, borderRadius: t.radiusSm, padding: 10, gap: 8, borderWidth: 1, borderColor: t.border }}>
            <Stack row gap={2}>
              <Text style={{ flex: 1, color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>Champ {i + 1}</Text>
              <IconBtn icon="arrow-up" label="Monter le champ" size={17} onPress={() => moveField(mid, e.id, f.id, -1)} disabled={i === 0} />
              <IconBtn icon="arrow-down" label="Descendre le champ" size={17} onPress={() => moveField(mid, e.id, f.id, 1)} disabled={i === e.fields.length - 1} />
              <IconBtn icon="close-circle-outline" label="Supprimer le champ" size={18} color={t.danger} onPress={() => removeField(mid, e.id, f.id)} />
            </Stack>
            <Input label="Nom" value={f.name} max={LIMITS.fieldName} onChangeText={(v) => updateField(mid, e.id, f.id, { name: v })} placeholder="Nom du champ" />
            <Input label="Valeur" value={f.value} max={LIMITS.fieldValue} multiline style={{ minHeight: 60 }} onChangeText={(v) => updateField(mid, e.id, f.id, { value: v })} placeholder="Valeur (markdown)" />
            <ToggleRow label="En ligne" description="Affiche jusqu'à 3 champs côte à côte" value={f.inline} onChange={(v) => updateField(mid, e.id, f.id, { inline: v })} />
          </View>
        ))}
        <Button icon="add" label="Ajouter un champ" onPress={() => addField(mid, e.id)} disabled={e.fields.length >= LIMITS.fields} />
      </Box>

      <Box title="Images" icon="image-outline" defaultCollapsed={!e.image.url && !e.thumbnail.url}>
        <Input
          label="Image"
          value={e.image.url}
          error={urlError(e.image.url, true)}
          onChangeText={(v) => up({ image: { url: v } })}
          placeholder="https://… ou attachment://fichier.png"
          autoCapitalize="none"
          keyboardType="url"
        />
        <Input
          label="Miniature"
          value={e.thumbnail.url}
          error={urlError(e.thumbnail.url, true)}
          onChangeText={(v) => up({ thumbnail: { url: v } })}
          placeholder="https://… ou attachment://fichier.png"
          autoCapitalize="none"
          keyboardType="url"
        />
      </Box>

      <Box title="Pied de page" icon="reorder-two-outline" defaultCollapsed={!e.footer.text && !e.timestamp}>
        <Input label="Texte" value={e.footer.text} max={LIMITS.footer} onChangeText={(v) => up({ footer: { ...e.footer, text: v } })} placeholder="Texte du pied de page" />
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
    </Box>
  );
}
