import React, { useEffect, useRef } from 'react';
import { Animated, Image, Modal, Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { useEndpoints } from '../state/useEndpoints';
import { emojiUrl } from '../api/fluxer';
import EMOJI_NAMES from '../data/emojiNames.json';

/**
 * Petite fiche d'information d'un emoji, comme dans Fluxer : nom en titre et une phrase d'explication
 * (reprise du client officiel, en anglais).
 */

export type EmojiTarget = { kind: 'unicode'; char: string } | { kind: 'custom'; id: string; name: string; animated: boolean };

const NAMES = EMOJI_NAMES as Record<string, string>;
const MODIFIERS = /[\u{1F3FB}-\u{1F3FF}️]/gu;

/** Nom Fluxer d'un emoji Unicode (« :wave: »), tons de peau ignorés. */
export function unicodeEmojiName(char: string): string | null {
  const direct = NAMES[char] ?? NAMES[char.replace(/️/g, '')];
  if (direct) return direct;
  const base = MODIFIERS ? char.replace(MODIFIERS, '') : char;
  return NAMES[base] ?? NAMES[`${base}️`] ?? null;
}

/** Fiche d'un emoji, ouverte par le bloc de texte qui le contient (donc toujours au-dessus de sa fenêtre). */
export function EmojiInfoPopup({ target, onClose }: { target: EmojiTarget | null; onClose: () => void }) {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const session = useSession();
  const scale = useRef(new Animated.Value(0.9)).current;
  const setTarget = (_: null) => onClose();
  useEffect(() => {
    if (!target) return;
    scale.setValue(0.9);
    Animated.spring(scale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }).start();
  }, [target, scale]);

  let title = '';
  let description = '';
  if (target?.kind === 'unicode') {
    const n = unicodeEmojiName(target.char);
    title = n ? `:${n}:` : target.char;
    description = 'A default emoji. You can use it anywhere on Fluxer.';
  } else if (target?.kind === 'custom') {
    title = `:${target.name}:`;
    // Emoji d'un serveur chargé dans l'app (compte ou bot) : on sait qu'il vient de cette communauté.
    const known = !!session.resolve('emoji', target.id);
    description = known ? 'A custom emoji from this community. You can use it anywhere on Fluxer.' : 'This is a custom emoji from a community.';
  }

  if (!target) return null;
  return (
      <Modal visible={!!target} transparent animationType="fade" onRequestClose={() => setTarget(null)} statusBarTranslucent>
        <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={() => setTarget(null)} accessibilityLabel="Fermer">
          <BlurView intensity={25} tint={t.dark ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          <Animated.View
            accessibilityRole="summary"
            style={{
              width: '100%',
              maxWidth: 380,
              transform: [{ scale }],
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              padding: 16,
              borderRadius: t.radius + 2,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
              elevation: 12,
              shadowColor: '#000',
              shadowOpacity: 0.35,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <View style={{ width: t.z(56), height: t.z(56), borderRadius: t.radiusSm, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
              {target?.kind === 'custom' ? (
                <Image source={{ uri: emojiUrl(ep, target.id, target.animated, 128) }} style={{ width: t.z(44), height: t.z(44) }} resizeMode="contain" />
              ) : (
                <Text style={{ fontSize: t.z(36), lineHeight: t.z(44) }}>{target?.kind === 'unicode' ? target.char : ''}</Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text selectable numberOfLines={2} style={{ color: t.text, fontWeight: '800', fontSize: t.font(16) }}>
                {title}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(18) }}>{description}</Text>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
  );
}
