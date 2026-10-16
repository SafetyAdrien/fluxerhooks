import React, { useRef, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input, type IconName } from './ui';
import { useSettings } from '../state/settings';
import { MentionComposer } from './MentionComposer';

type Action = {
  key: string;
  label: string;
  icon?: IconName;
  text?: string;
  wrap?: [string, string];
  line?: string;
  insert?: () => string;
  multilineOnly?: boolean;
};

const ACTIONS: Action[] = [
  { key: 'b', label: 'Gras', text: 'B', wrap: ['**', '**'] },
  { key: 'i', label: 'Italique', text: 'I', wrap: ['*', '*'] },
  { key: 'u', label: 'Souligné', text: 'U', wrap: ['__', '__'] },
  { key: 's', label: 'Barré', text: 'S', wrap: ['~~', '~~'] },
  { key: 'spoiler', label: 'Spoiler', icon: 'eye-off', wrap: ['||', '||'] },
  { key: 'code', label: 'Code', icon: 'code-slash', wrap: ['`', '`'] },
  { key: 'link', label: 'Lien masqué', icon: 'link', wrap: ['[', '](https://)'] },
  { key: 'h1', label: 'Titre 1', text: 'H1', line: '# ', multilineOnly: true },
  { key: 'h2', label: 'Titre 2', text: 'H2', line: '## ', multilineOnly: true },
  { key: 'h3', label: 'Titre 3', text: 'H3', line: '### ', multilineOnly: true },
  { key: 'sub', label: 'Sous-texte', text: '-#', line: '-# ', multilineOnly: true },
  { key: 'quote', label: 'Citation', icon: 'chatbox-ellipses', line: '> ', multilineOnly: true },
  { key: 'list', label: 'Liste à puces', icon: 'list', line: '- ', multilineOnly: true },
  { key: 'olist', label: 'Liste numérotée', text: '1.', line: '1. ', multilineOnly: true },
  { key: 'block', label: 'Bloc de code', icon: 'terminal', wrap: ['```\n', '\n```'], multilineOnly: true },
];

/**
 * Champ texte avec barre d'outils markdown (agit sur la sélection courante)
 * et compositeur de mentions (#salons, @rôles, émojis, horodatages…).
 */
export function RichInput({
  label,
  value,
  onChange,
  max,
  placeholder,
  minHeight = 110,
  singleLine,
  onImportImages,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  placeholder?: string;
  minHeight?: number;
  singleLine?: boolean;
  onImportImages?: () => void;
}) {
  const { theme: t, haptic } = useSettings();
  const sel = useRef({ start: value.length, end: value.length });
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [showBar, setShowBar] = useState(false);
  const [composer, setComposer] = useState(false);

  const applyText = (next: string, cursor: number) => {
    onChange(next);
    sel.current = { start: cursor, end: cursor };
    setSelection({ start: cursor, end: cursor });
    setTimeout(() => setSelection(undefined), 50);
  };

  const insertText = (ins: string) => {
    const s = Math.min(sel.current.start, value.length);
    const e = Math.min(sel.current.end, value.length);
    const before = value.slice(0, s);
    const pad = before && !/\s$/.test(before) && /^[<@#:]/.test(ins) ? ' ' : '';
    applyText(before + pad + ins + value.slice(e), s + pad.length + ins.length);
  };

  const run = (a: Action) => {
    haptic('light');
    const s = Math.min(sel.current.start, value.length);
    const e = Math.min(sel.current.end, value.length);
    if (a.wrap) {
      const inner = value.slice(s, e);
      const next = value.slice(0, s) + a.wrap[0] + inner + a.wrap[1] + value.slice(e);
      applyText(next, inner ? s + a.wrap[0].length + inner.length + a.wrap[1].length : s + a.wrap[0].length);
    } else if (a.line) {
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      applyText(value.slice(0, lineStart) + a.line + value.slice(lineStart), e + a.line.length);
    } else if (a.insert) insertText(a.insert());
  };

  const actions = singleLine ? ACTIONS.filter((a) => !a.multilineOnly) : ACTIONS;
  const tool = (key: string, label: string, onPress: () => void, content: React.ReactNode, accent?: boolean) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minWidth: t.z(38),
        height: t.z(34),
        paddingHorizontal: 8,
        borderRadius: t.radiusSm,
        backgroundColor: accent ? t.accentSoft : pressed ? t.accentSoft : t.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      {content}
    </Pressable>
  );

  return (
    <View style={{ gap: 6 }}>
      <Input
        label={label}
        value={value}
        onChangeText={onChange}
        max={max}
        placeholder={placeholder}
        multiline={!singleLine}
        style={singleLine ? undefined : { minHeight: t.z(minHeight) }}
        selection={selection}
        onSelectionChange={(e) => (sel.current = e.nativeEvent.selection)}
        onFocus={() => setShowBar(true)}
        right={
          <View style={{ flexDirection: 'row' }}>
            <Pressable onPress={() => setComposer(true)} accessibilityLabel="Insérer une mention, un émoji ou un horodatage" hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="at" size={t.z(18)} color={t.textFaint} />
            </Pressable>
            <Pressable onPress={() => setShowBar((v) => !v)} accessibilityLabel="Outils de mise en forme" hitSlop={8} style={{ padding: 6 }}>
              <Ionicons name="text" size={t.z(18)} color={showBar ? t.accent : t.textFaint} />
            </Pressable>
          </View>
        }
      />
      {showBar && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={[{ gap: 6 }, t.css.toolbar]}
        >
          {tool('mention', 'Mentions et émojis', () => setComposer(true), <Ionicons name="at" size={t.z(16)} color={t.accent} />, true)}
          {onImportImages &&
            tool('img', 'Importer des images', onImportImages, <Ionicons name="images-outline" size={t.z(16)} color={t.accent} />, true)}
          {actions.map((a) =>
            tool(
              a.key,
              a.label,
              () => run(a),
              a.icon ? (
                <Ionicons name={a.icon} size={t.z(16)} color={t.text} />
              ) : (
                <Text
                  style={{
                    color: t.text,
                    fontSize: t.font(13),
                    fontWeight: a.key === 'b' ? '900' : '700',
                    fontStyle: a.key === 'i' ? 'italic' : 'normal',
                    textDecorationLine: a.key === 'u' ? 'underline' : a.key === 's' ? 'line-through' : 'none',
                  }}
                >
                  {a.text}
                </Text>
              ),
            ),
          )}
        </ScrollView>
      )}
      {composer && <MentionComposer visible onClose={() => setComposer(false)} onInsert={insertText} />}
    </View>
  );
}
