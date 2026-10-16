import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { DEFAULT_SETTINGS, useSettings } from '../state/settings';
import { CSS_CATEGORIES, ESSENTIAL, isColorValue, parseCss, parseCssVars, varsToCssText, type CssCategory, type ThemeVar } from '../theme/css';
import { Box, Button, Chip, FieldButton, FieldButtons, ListRow, Sheet, Stack, ToggleRow, useToast } from '../components/ui';
import { ColorPickerModal } from '../components/ColorPicker';
import { hexToInt, intToHex, readableOn } from '../utils/parse';

const SECTIONS: CssCategory[] = [ESSENTIAL, ...CSS_CATEGORIES];
const mono = { fontFamily: 'monospace' } as const;

/** Valeur courante d'une variable : personnalisée, sinon celle du thème actif. */
function useVar(v: ThemeVar) {
  const { theme: t, settings, update } = useSettings();
  const target = v.target;
  const custom =
    'setting' in target
      ? settings[target.setting] !== DEFAULT_SETTINGS[target.setting]
        ? settings[target.setting]
        : undefined
      : settings.themeVars?.[v.name];
  const value = custom ?? v.def(t);
  const set = (next: string | number | undefined) => {
    if ('setting' in target) {
      update({ [target.setting]: next ?? DEFAULT_SETTINGS[target.setting] } as any);
      return;
    }
    const vars = { ...(settings.themeVars ?? {}) };
    if (next === undefined) delete vars[v.name];
    else vars[v.name] = next;
    update({ themeVars: vars });
  };
  return { value, custom: custom !== undefined, set };
}

/** Ligne couleur façon Fluxer : libellé, code hex + pipette remplie de la couleur, nom --css, aide. */
function ColorVarRow({ v }: { v: ThemeVar }) {
  const { theme: t, haptic } = useSettings();
  const { value, custom, set } = useVar(v);
  const current = String(value);
  const [text, setText] = useState(current.toUpperCase());
  const [focus, setFocus] = useState(false);
  const [picker, setPicker] = useState(false);
  useEffect(() => {
    if (!focus) setText(current.toUpperCase());
  }, [current, focus]);
  const valid = isColorValue(text);
  const swatch = isColorValue(current) && current !== 'transparent' ? current : null;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: t.font(15) }}>{v.label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          borderRadius: t.radiusSm,
          borderWidth: 1,
          borderColor: !valid ? t.danger : focus ? t.accent : t.border,
          backgroundColor: t.surface2,
          overflow: 'hidden',
          minHeight: t.z(50),
        }}
      >
        <TextInput
          value={text}
          onChangeText={(x) => {
            const s = x.startsWith('#') || x === 'transparent' || !x ? x : `#${x}`;
            setText(s.toUpperCase());
            if (isColorValue(s)) set(s.toUpperCase());
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => {
            setFocus(false);
            if (!isColorValue(text)) setText(current.toUpperCase());
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={11}
          accessibilityLabel={`${v.label} (code couleur)`}
          selectionColor={t.accent}
          style={{ flex: 1, minWidth: 0, color: t.text, fontSize: t.font(16), paddingHorizontal: 14, letterSpacing: 1, ...mono }}
        />
        <Pressable
          onPress={() => {
            haptic('light');
            setPicker(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Choisir la couleur : ${v.label}`}
          style={({ pressed }) => ({
            width: t.z(64),
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: swatch ?? t.surface,
            borderLeftWidth: 1,
            borderLeftColor: t.border,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <MaterialCommunityIcons name={swatch ? 'eyedropper-variant' : 'eyedropper-off'} size={t.z(22)} color={swatch ? readableOn(swatch.slice(0, 7)) : t.textMuted} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13), flexShrink: 1, ...mono }}>--{v.name}</Text>
        {custom && (
          <Pressable onPress={() => set(undefined)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Réinitialiser ${v.label}`}>
            <Text style={{ color: t.accent, fontSize: t.font(12), fontWeight: '700' }}>Réinitialiser</Text>
          </Pressable>
        )}
      </View>
      {!!v.hint && <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(18) }}>{v.hint}</Text>}
      {picker && (
        <ColorPickerModal
          visible
          title={v.label}
          value={swatch ? hexToInt(swatch.slice(0, 7)) : null}
          onClose={() => setPicker(false)}
          onPick={(c) => {
            set(c === null ? undefined : intToHex(c).toUpperCase());
            setPicker(false);
          }}
        />
      )}
    </View>
  );
}

/** Ligne de taille : valeur en px, boutons − / + dans le thème. */
function SizeVarRow({ v }: { v: ThemeVar }) {
  const { theme: t } = useSettings();
  const { value, custom, set } = useVar(v);
  const n = Number(value);
  const [text, setText] = useState(String(n));
  useEffect(() => setText(String(n)), [n]);
  const clamp = (x: number) => Math.min(v.max ?? 999, Math.max(v.min ?? 0, Math.round(x)));
  const step = (v.max ?? 40) > 100 ? 4 : 1;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: t.font(15) }}>{v.label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: t.radiusSm, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2, paddingRight: 8, minHeight: t.z(50) }}>
        <TextInput
          value={text}
          onChangeText={(x) => {
            setText(x.replace(/[^0-9.]/g, ''));
            const k = parseFloat(x);
            if (isFinite(k)) set(clamp(k));
          }}
          keyboardType="numeric"
          accessibilityLabel={`${v.label} (pixels)`}
          selectionColor={t.accent}
          style={{ flex: 1, minWidth: 0, color: t.text, fontSize: t.font(16), paddingHorizontal: 14, ...mono }}
        />
        <Text style={{ color: t.textMuted, fontSize: t.font(13), ...mono }}>px</Text>
        <FieldButtons>
          <FieldButton icon="remove" label={`Diminuer : ${v.label}`} onPress={() => set(clamp(n - step))} />
          <FieldButton icon="add" label={`Augmenter : ${v.label}`} onPress={() => set(clamp(n + step))} />
        </FieldButtons>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13), ...mono }}>--{v.name}</Text>
        <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>
          {v.min}–{v.max} px
        </Text>
        {custom && (
          <Pressable onPress={() => set(undefined)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Réinitialiser ${v.label}`}>
            <Text style={{ color: t.accent, fontSize: t.font(12), fontWeight: '700' }}>Réinitialiser</Text>
          </Pressable>
        )}
      </View>
      {!!v.hint && <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(18) }}>{v.hint}</Text>}
    </View>
  );
}

/** CSS libre de la section (sélecteurs), pour aller plus loin que les variables. */
function AdvancedCss({ category }: { category: CssCategory }) {
  const { theme: t, settings, update } = useSettings();
  const toast = useToast();
  const saved = settings.customCss?.[category.key] ?? '';
  const [src, setSrc] = useState(saved);
  useEffect(() => setSrc(saved), [saved, category.key]);
  const result = useMemo(() => parseCss(src), [src]);
  const dirty = src !== saved;
  return (
    <Box title="CSS avancé" icon="code-slash-outline" subtitle={saved.trim() ? `${Object.keys(parseCss(saved).rules).length} règle(s) active(s)` : 'Sélecteurs et propriétés libres'} defaultCollapsed>
      <View style={{ gap: 2 }}>
        {category.selectors.map((s) => (
          <ListRow
            key={s.name}
            icon="code-outline"
            title={s.name}
            subtitle={s.description}
            onPress={() => setSrc((x) => `${x.trimEnd()}${x.trim() ? '\n\n' : ''}${s.name} {\n  \n}`)}
            right={<Text style={{ color: t.accent, fontWeight: '700' }}>Insérer</Text>}
          />
        ))}
      </View>
      <View style={{ borderRadius: t.radiusSm, borderWidth: 1, borderColor: result.errors.length ? t.danger : t.border, backgroundColor: t.surface2 }}>
        <TextInput
          value={src}
          onChangeText={setSrc}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={category.example}
          placeholderTextColor={t.textFaint}
          accessibilityLabel={`CSS avancé : ${category.label}`}
          textAlignVertical="top"
          style={{ minHeight: t.z(180), color: t.text, fontSize: t.font(13), padding: 12, ...mono }}
        />
      </View>
      <Text style={{ color: result.errors.length ? t.danger : t.textMuted, fontSize: t.font(12) }}>
        {result.errors.length ? result.errors.slice(0, 3).join('\n') : src.trim() ? `${Object.keys(result.rules).length} règle(s) valide(s)` : 'Forme : sélecteur { propriété: valeur; }'}
      </Text>
      <Stack row wrap gap={8}>
        <Button small icon="bulb-outline" label="Exemple" onPress={() => setSrc(category.example)} />
        <Button
          small
          flex
          variant="primary"
          icon="checkmark"
          label={dirty ? 'Appliquer' : 'Appliqué'}
          disabled={!dirty}
          onPress={() => {
            update({ customCss: { ...(settings.customCss ?? {}), [category.key]: src } });
            toast('CSS appliqué.', 'success');
          }}
        />
      </Stack>
    </Box>
  );
}

/** Éditeur de thème : variables par section (comme « Theme colors » de Fluxer) + CSS avancé. */
export function CssEditorSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme: t, settings, update } = useSettings();
  const toast = useToast();
  const [cat, setCat] = useState(SECTIONS[0].key);
  const section = SECTIONS.find((c) => c.key === cat)!;
  const customCount = Object.keys(settings.themeVars ?? {}).length;

  const resetSection = () => {
    const vars = { ...(settings.themeVars ?? {}) };
    section.vars.forEach((v) => delete vars[v.name]);
    const patch: any = { themeVars: vars };
    if (section.key === 'essential') Object.assign(patch, { accent: DEFAULT_SETTINGS.accent, radius: DEFAULT_SETTINGS.radius });
    else patch.customCss = { ...(settings.customCss ?? {}), [section.key]: '' };
    update(patch);
    toast(`« ${section.label} » réinitialisé.`, 'success');
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Couleurs et styles"
      full
      footer={
        <Stack row gap={8}>
          <Button icon="refresh-outline" label="Réinitialiser la section" onPress={resetSection} />
          <Button flex variant="primary" icon="checkmark" label="Terminé" onPress={onClose} />
        </Stack>
      }
    >
      <ToggleRow
        icon="color-wand-outline"
        label="Activer la personnalisation"
        description={`${customCount} variable(s) personnalisée(s) · appliqué en direct`}
        value={settings.customCssEnabled}
        onChange={(v) => update({ customCssEnabled: v })}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SECTIONS.map((c) => (
          <Chip key={c.key} label={c.label} icon={c.icon as any} selected={c.key === cat} onPress={() => setCat(c.key)} />
        ))}
      </ScrollView>

      <Text style={{ color: t.textMuted, fontWeight: '800', fontSize: t.font(16), marginTop: 4 }}>{section.section}</Text>
      <View style={{ gap: t.z(22), opacity: settings.customCssEnabled ? 1 : 0.5 }} pointerEvents={settings.customCssEnabled ? 'auto' : 'none'}>
        {section.vars.map((v) => (v.kind === 'color' ? <ColorVarRow key={v.name} v={v} /> : <SizeVarRow key={v.name} v={v} />))}
      </View>

      {section.key !== 'essential' && <AdvancedCss category={section} />}

      <Box title="Partager le thème" icon="share-social-outline" defaultCollapsed subtitle="Variables au format CSS :root">
        <Stack row wrap gap={8}>
          <Button
            small
            icon="copy-outline"
            label="Copier les variables"
            onPress={async () => {
              const vars = { ...(settings.themeVars ?? {}), 'brand-primary': settings.accent, radius: settings.radius };
              await Clipboard.setStringAsync(varsToCssText(vars));
              toast('Variables copiées.', 'success');
            }}
          />
          <Button
            small
            icon="clipboard-outline"
            label="Coller des variables"
            onPress={async () => {
              const parsed = parseCssVars(await Clipboard.getStringAsync());
              const { ['brand-primary']: accent, radius, ...rest } = parsed;
              if (!Object.keys(parsed).length) return toast('Aucune variable --nom: valeur; reconnue.', 'error');
              update({
                themeVars: { ...(settings.themeVars ?? {}), ...rest },
                ...(typeof accent === 'string' ? { accent } : {}),
                ...(typeof radius === 'number' ? { radius } : {}),
              });
              toast(`${Object.keys(parsed).length} variable(s) importée(s).`, 'success');
            }}
          />
        </Stack>
      </Box>
    </Sheet>
  );
}
