import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettings } from '../state/settings';
import { LANGUAGES, systemLanguage, tr } from '../i18n';
import { Dialog } from './ui';

/** Sélecteur de langue : langue du système ou l'une des 10 langues proposées. */
export function LanguagePicker({ onClose }: { onClose: () => void }) {
  const { theme: t, settings, update, haptic } = useSettings();
  const sys = LANGUAGES.find((l) => l.code === systemLanguage())!;
  const choose = (code: string) => {
    haptic('light');
    update({ language: code });
    onClose();
  };
  const row = (key: string, flag: React.ReactNode, title: string, subtitle: string, selected: boolean) => (
    <Pressable
      key={key}
      onPress={() => choose(key)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: t.radiusSm,
        backgroundColor: selected ? t.accentSoft : pressed ? t.surface2 : 'transparent',
        borderWidth: 1,
        borderColor: selected ? t.accent : 'transparent',
      })}
    >
      <View style={{ width: t.z(32), alignItems: 'center' }}>{flag}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: t.font(15) }}>{title}</Text>
        <Text style={{ color: t.textMuted, fontSize: t.font(12) }}>{subtitle}</Text>
      </View>
      {selected && <Ionicons name="checkmark-circle" size={t.z(22)} color={t.accent} />}
    </Pressable>
  );
  return (
    <Dialog visible onClose={onClose} title="Choisir la langue" icon="language-outline">
      <View style={{ gap: 4 }}>
        {row(
          'system',
          <MaterialCommunityIcons name="cellphone-cog" size={t.z(24)} color={t.accent} />,
          tr('Langue du système'),
          `${sys.flag} ${sys.native}`,
          settings.language === 'system',
        )}
        {LANGUAGES.map((l) => row(l.code, <Text style={{ fontSize: t.z(24) }}>{l.flag}</Text>, l.native, l.english, settings.language === l.code))}
      </View>
    </Dialog>
  );
}
