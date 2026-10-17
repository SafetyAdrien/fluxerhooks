import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../state/settings';
import { Input, Sheet } from './ui';
import { isForumType } from '../api/fluxer';
import { tr } from '../i18n';

/** Icône d'un salon selon son type Fluxer (façon client officiel). */
export function ChannelIcon({ type, size = 18, color }: { type: number; size?: number; color?: string }) {
  const { theme: t } = useSettings();
  const c = color ?? t.textMuted;
  const s = t.z(size);
  if (type === 0) return <Text style={{ color: c, fontSize: s * 1.15, fontWeight: '800', width: s, textAlign: 'center' }}>#</Text>;
  const name =
    type === 2
      ? 'volume-medium-outline'
      : type === 4
        ? 'folder-outline'
        : type === 5
          ? 'megaphone-outline'
          : type === 10 || type === 11
            ? 'git-branch-outline'
            : type === 12
              ? 'lock-closed-outline'
              : type === 15
                ? 'chatbubbles-outline'
                : type === 16
                  ? 'images-outline'
                  : type === 998
                    ? 'link-outline'
                    : 'chatbox-outline';
  return <Ionicons name={name as any} size={s} color={c} />;
}

export const channelTypeLabel = (type: number) =>
  ({ 0: 'Texte', 2: 'Vocal', 4: 'Catégorie', 5: 'Annonces', 10: 'Thread d’annonce', 11: 'Thread', 12: 'Thread privé', 15: 'Forum', 16: 'Média', 998: 'Lien' })[type] ??
  (isForumType(type) ? 'Forum' : 'Salon');

export interface DropdownOption {
  value: string;
  label: string;
  subtitle?: string;
  left?: React.ReactNode;
  /** Décalage visuel (ex. thread sous son salon). */
  indent?: number;
  disabled?: boolean;
  group?: string;
}

/**
 * Menu déroulant moderne : un champ cliquable qui ouvre une feuille
 * avec recherche, sections (catégories) et icônes.
 */
export function Dropdown({
  label,
  placeholder = 'Choisir…',
  value,
  options,
  onChange,
  title,
  emptyText = 'Aucun élément',
  loading,
  searchable = true,
}: {
  label?: string;
  placeholder?: string;
  value: string | null;
  options: DropdownOption[];
  onChange: (value: string) => void;
  title?: string;
  emptyText?: string;
  loading?: boolean;
  searchable?: boolean;
}) {
  label = tr(label);
  placeholder = tr(placeholder);
  title = tr(title);
  emptyText = tr(emptyText);
  const { theme: t, haptic } = useSettings();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const filtered = ql ? options.filter((o) => o.label.toLowerCase().includes(ql) || o.subtitle?.toLowerCase().includes(ql)) : options;
    const out: { name: string; items: DropdownOption[] }[] = [];
    filtered.forEach((o) => {
      const g = o.group ?? '';
      let bucket = out.find((x) => x.name === g);
      if (!bucket) out.push((bucket = { name: g, items: [] }));
      bucket.items.push(o);
    });
    return out;
  }, [options, q]);

  return (
    <View style={{ gap: 5 }}>
      {!!label && <Text style={[{ color: t.textMuted, fontSize: t.font(12), fontWeight: '700' }, t.css.label]}>{label}</Text>}
      <Pressable
        onPress={() => {
          haptic('light');
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={label ?? title}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: t.z(48),
            paddingHorizontal: 12,
            borderRadius: t.radiusSm,
            backgroundColor: t.surface2,
            borderWidth: 1.5,
            borderColor: open ? t.accent : 'transparent',
            opacity: pressed ? 0.85 : 1,
          },
          t.css.input,
        ]}
      >
        {current?.left}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: current ? t.text : t.textFaint, fontSize: t.font(15), fontWeight: current ? '600' : '400' }}>
            {loading ? 'Chargement…' : (current?.label ?? placeholder)}
          </Text>
          {!!current?.subtitle && (
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>
              {current.subtitle}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-down" size={t.z(18)} color={t.textMuted} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={title ?? label ?? 'Choisir'} full={options.length > 8}>
        {searchable && options.length > 6 && (
          <Input value={q} onChangeText={setQ} placeholder="Rechercher…" autoCapitalize="none" right={<Ionicons name="search" size={t.z(18)} color={t.textFaint} />} />
        )}
        {!groups.length && <Text style={{ color: t.textMuted, textAlign: 'center', padding: 20 }}>{loading ? 'Chargement…' : emptyText}</Text>}
        {groups.map((g) => (
          <View key={g.name || '_'} style={{ gap: 2 }}>
            {!!g.name && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 2, paddingHorizontal: 4 }}>
                <Ionicons name="chevron-down" size={t.z(12)} color={t.textFaint} />
                <Text style={{ color: t.textFaint, fontSize: t.font(11), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 }} numberOfLines={1}>
                  {g.name}
                </Text>
              </View>
            )}
            {g.items.map((o) => {
              const selected = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  disabled={o.disabled}
                  onPress={() => {
                    haptic('light');
                    onChange(o.value);
                    setOpen(false);
                    setQ('');
                  }}
                  android_ripple={{ color: t.accentSoft }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: t.z(46),
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    marginLeft: (o.indent ?? 0) * t.z(20),
                    borderRadius: t.radiusSm,
                    opacity: o.disabled ? 0.4 : 1,
                    backgroundColor: selected ? t.accentSoft : pressed ? t.surface2 : 'transparent',
                  })}
                >
                  {!!o.indent && <View style={{ width: 2, alignSelf: 'stretch', backgroundColor: t.border, borderRadius: 1 }} />}
                  {o.left}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: selected ? t.accent : t.text, fontSize: t.font(15), fontWeight: selected ? '700' : '500' }}>
                      {o.label}
                    </Text>
                    {!!o.subtitle && (
                      <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>
                        {o.subtitle}
                      </Text>
                    )}
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={t.z(20)} color={t.accent} />}
                </Pressable>
              );
            })}
          </View>
        ))}
      </Sheet>
    </View>
  );
}
