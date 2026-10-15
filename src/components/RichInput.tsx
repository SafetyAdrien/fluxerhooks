import React, { useRef, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input, type IconName } from './ui';
import { useSettings } from '../state/settings';

type Action = { key: string; label: string; icon?: IconName; text?: string; wrap?: [string, string]; line?: string; insert?: () => string };

const ACTIONS: Action[] = [
  { key: 'b', label: 'Gras', text: 'B', wrap: ['**', '**'] },
  { key: 'i', label: 'Italique', text: 'I', wrap: ['*', '*'] },
  { key: 'u', label: 'Souligné', text: 'U', wrap: ['__', '__'] },
  { key: 's', label: 'Barré', text: 'S', wrap: ['~~', '~~'] },
  { key: 'code', label: 'Code', icon: 'code-slash', wrap: ['`', '`'] },
  { key: 'block', label: 'Bloc de code', icon: 'terminal', wrap: ['```\n', '\n```'] },
  { key: 'spoiler', label: 'Spoiler', icon: 'eye-off', wrap: ['||', '||'] },
  { key: 'link', label: 'Lien', icon: 'link', wrap: ['[', '](https://)'] },
  { key: 'h', label: 'Titre', text: 'H', line: '## ' },
  { key: 'sub', label: 'Sous-texte', text: '-#', line: '-# ' },
  { key: 'quote', label: 'Citation', icon: 'chatbox-ellipses', line: '> ' },
  { key: 'list', label: 'Liste', icon: 'list', line: '- ' },
  { key: 'time', label: 'Horodatage', icon: 'time', insert: () => `<t:${Math.floor(Date.now() / 1000)}:F>` },
  { key: 'everyone', label: '@everyone', text: '@', insert: () => '@everyone' },
];

/** Champ texte avec barre d'outils markdown (agit sur la sélection courante). */
export function RichInput({
  label,
  value,
  onChange,
  max,
  placeholder,
  minHeight = 110,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  placeholder?: string;
  minHeight?: number;
}) {
  const { theme: t, haptic } = useSettings();
  const sel = useRef({ start: value.length, end: value.length });
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const [showBar, setShowBar] = useState(false);

  const run = (a: Action) => {
    haptic('light');
    const { start, end } = sel.current;
    const s = Math.min(start, value.length);
    const e = Math.min(end, value.length);
    let next = value;
    let cursor = e;
    if (a.wrap) {
      const inner = value.slice(s, e);
      next = value.slice(0, s) + a.wrap[0] + inner + a.wrap[1] + value.slice(e);
      cursor = inner ? s + a.wrap[0].length + inner.length + a.wrap[1].length : s + a.wrap[0].length;
    } else if (a.line) {
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      next = value.slice(0, lineStart) + a.line + value.slice(lineStart);
      cursor = e + a.line.length;
    } else if (a.insert) {
      const ins = a.insert();
      next = value.slice(0, s) + ins + value.slice(e);
      cursor = s + ins.length;
    }
    onChange(next);
    sel.current = { start: cursor, end: cursor };
    setSelection({ start: cursor, end: cursor });
    setTimeout(() => setSelection(undefined), 50);
  };

  return (
    <View style={{ gap: 6 }}>
      <Input
        label={label}
        value={value}
        onChangeText={onChange}
        max={max}
        placeholder={placeholder}
        multiline
        style={{ minHeight }}
        selection={selection}
        onSelectionChange={(e) => (sel.current = e.nativeEvent.selection)}
        onFocus={() => setShowBar(true)}
        right={
          <Pressable
            onPress={() => setShowBar((v) => !v)}
            accessibilityLabel="Outils de mise en forme"
            hitSlop={8}
            style={{ padding: 6 }}
          >
            <Ionicons name="text" size={18} color={showBar ? t.accent : t.textFaint} />
          </Pressable>
        }
      />
      {showBar && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 6 }}>
          {ACTIONS.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => run(a)}
              accessibilityLabel={a.label}
              style={({ pressed }) => ({
                minWidth: 38,
                height: 34,
                paddingHorizontal: 8,
                borderRadius: t.radiusSm,
                backgroundColor: pressed ? t.accentSoft : t.surface2,
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              {a.icon ? (
                <Ionicons name={a.icon} size={16} color={t.text} />
              ) : (
                <Text
                  style={{
                    color: t.text,
                    fontWeight: a.key === 'b' ? '900' : '700',
                    fontStyle: a.key === 'i' ? 'italic' : 'normal',
                    textDecorationLine: a.key === 'u' ? 'underline' : a.key === 's' ? 'line-through' : 'none',
                  }}
                >
                  {a.text}
                </Text>
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
