import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSettings } from '../state/settings';
import { CSS_CATEGORIES, compileSheets, parseCss } from '../theme/css';
import { Button, Chip, Input, ListRow, Sheet, Stack, ToggleRow, useToast } from '../components/ui';

/** Éditeur de styles personnalisés, une feuille par catégorie (Structure, Composants, Texte, Champs, Aperçu). */
export function CssEditorSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme: t, settings, update } = useSettings();
  const toast = useToast();
  const [cat, setCat] = useState(CSS_CATEGORIES[0].key);
  const [draft, setDraft] = useState<Record<string, string>>(settings.customCss ?? {});

  useEffect(() => {
    if (visible) setDraft(settings.customCss ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const category = CSS_CATEGORIES.find((c) => c.key === cat)!;
  const src = draft[cat] ?? '';
  const result = useMemo(() => parseCss(src), [src]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.customCss ?? {});
  const total = Object.keys(compileSheets(draft).rules).length;

  const insert = (sel: string) => {
    setDraft((d) => ({ ...d, [cat]: `${(d[cat] ?? '').trimEnd()}${d[cat]?.trim() ? '\n\n' : ''}${sel} {\n  \n}` }));
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Styles personnalisés"
      full
      footer={
        <Stack row gap={8}>
          <Button
            icon="trash-outline"
            label="Tout effacer"
            onPress={() => {
              setDraft({});
              update({ customCss: {} });
              toast('Styles réinitialisés.', 'success');
            }}
          />
          <Button
            flex
            variant="primary"
            icon="checkmark"
            label={dirty ? 'Appliquer' : 'Appliqué'}
            disabled={!dirty}
            onPress={() => {
              update({ customCss: draft });
              toast('Styles appliqués.', 'success');
            }}
          />
        </Stack>
      }
    >
      <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>
        Écris des règles façon CSS : <Text style={{ fontFamily: 'monospace', color: t.text }}>sélecteur {'{'} propriété: valeur; {'}'}</Text>. Propriétés acceptées : couleurs (background, color, border-color…), tailles (padding, margin, border-radius, border-width, font-size, letter-spacing…), font-weight, text-transform, opacity, etc.
      </Text>
      <ToggleRow
        icon="color-wand-outline"
        label="Activer les styles personnalisés"
        description={`${total} sélecteur(s) personnalisé(s)`}
        value={settings.customCssEnabled}
        onChange={(v) => update({ customCssEnabled: v })}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {CSS_CATEGORIES.map((c) => (
          <Chip key={c.key} label={c.label} icon={c.icon as any} selected={c.key === cat} onPress={() => setCat(c.key)} />
        ))}
      </ScrollView>

      <View style={{ gap: 2 }}>
        {category.selectors.map((s) => (
          <ListRow key={s.name} icon="code-outline" title={s.name} subtitle={s.description} onPress={() => insert(s.name)} right={<Text style={{ color: t.accent, fontWeight: '700' }}>Insérer</Text>} />
        ))}
      </View>

      <Input
        value={src}
        onChangeText={(v) => setDraft((d) => ({ ...d, [cat]: v }))}
        multiline
        mono
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={category.example}
        style={{ minHeight: t.z(220), fontSize: t.font(13) }}
        error={result.errors.length ? result.errors.slice(0, 3).join('\n') : null}
        hint={src.trim() ? `${Object.keys(result.rules).length} règle(s) valide(s)` : 'Feuille vide'}
      />
      <Stack row wrap gap={8}>
        <Button small icon="bulb-outline" label="Exemple" onPress={() => setDraft((d) => ({ ...d, [cat]: category.example }))} />
        <Button small icon="copy-outline" label="Copier tout" onPress={async () => { await Clipboard.setStringAsync(JSON.stringify(draft, null, 2)); toast('Styles copiés.', 'success'); }} />
        <Button
          small
          icon="clipboard-outline"
          label="Coller tout"
          onPress={async () => {
            try {
              const parsed = JSON.parse(await Clipboard.getStringAsync());
              if (parsed && typeof parsed === 'object') setDraft(parsed);
            } catch {
              toast('Le presse-papiers ne contient pas de styles FluxerHooks.', 'error');
            }
          }}
        />
      </Stack>
    </Sheet>
  );
}
