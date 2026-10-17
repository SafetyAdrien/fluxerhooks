import React, { useEffect, useRef } from 'react';
import { tr } from '../i18n';
import { Animated, Easing, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { useSession } from '../state/session';
import { useBotGateway } from '../state/botGateway';
import { useLibrary } from '../state/library';
import { useSender } from '../state/useSender';
import { useEndpoints } from '../state/useEndpoints';
import { avatarUrl } from '../api/fluxer';
import { Avatar, Tip } from '../components/ui';
import { shade, withAlpha } from '../utils/parse';

export type LandingAction = 'settings' | 'account' | 'data' | 'json' | 'bot' | 'css';

/** Boucle d'animation aller-retour (thème animé de la bannière). */
function useLoop(duration: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [v, duration, delay]);
  return v;
}

function Blob({ color, size, x, y, dx, dy, duration, delay }: { color: string; size: number; x: number; y: number; dx: number; dy: number; duration: number; delay?: number }) {
  const p = useLoop(duration, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: 0.75,
        transform: [
          { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          { scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
        ],
      }}
    />
  );
}

function Sparkle({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const p = useLoop(1800, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: '#fff',
        opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.9] }),
        transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] }) }],
      }}
    />
  );
}

/** Bannière principale : dégradé + taches de couleur animées sous un verre dépoli. */
function Hero() {
  const { theme: t } = useSettings();
  const { width } = useWindowDimensions();
  const w = Math.min(width - 2 * t.gap, 900);
  const h = t.z(340);
  const pulse = useLoop(1600);
  const float = useLoop(2600, 300);
  const accent = t.accent;
  return (
    <View style={{ height: h, borderRadius: t.radius + 10, overflow: 'hidden', backgroundColor: shade(accent, -0.55) }}>
      <LinearGradient colors={[shade(accent, -0.35), shade(accent, -0.65)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <Blob color={accent} size={w * 0.7} x={-w * 0.2} y={-h * 0.35} dx={w * 0.18} dy={h * 0.15} duration={5200} />
      <Blob color="#7E7AFF" size={w * 0.55} x={w * 0.55} y={h * 0.25} dx={-w * 0.2} dy={-h * 0.2} duration={6400} delay={400} />
      <Blob color="#22B8E6" size={w * 0.38} x={w * 0.1} y={h * 0.62} dx={w * 0.25} dy={-h * 0.12} duration={7200} delay={900} />
      <Blob color="#B8B6FE" size={w * 0.25} x={w * 0.72} y={-h * 0.1} dx={-w * 0.1} dy={h * 0.18} duration={4800} delay={200} />
      <BlurView intensity={45} tint="dark" experimentalBlurMethod="dimezisBlurView" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h * 0.6 }} />
      {[
        [0.08, 0.18, 4, 0],
        [0.85, 0.12, 3, 500],
        [0.62, 0.5, 5, 900],
        [0.25, 0.72, 3, 1300],
        [0.92, 0.7, 4, 300],
        [0.45, 0.1, 3, 1100],
      ].map(([x, y, s, d], i) => (
        <Sparkle key={i} x={w * x} y={h * y} size={t.z(s)} delay={d} />
      ))}

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: t.z(22), gap: 12 }}>
        <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }], alignSelf: 'center' }}>
          <Animated.View
            style={{
              position: 'absolute',
              top: -8,
              left: -8,
              right: -8,
              bottom: -8,
              borderRadius: t.z(26),
              backgroundColor: withAlpha('#ffffff', 0.18),
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.9] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
            }}
          />
          <View style={{ width: t.z(60), height: t.z(60), borderRadius: t.z(20), backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="lightning-bolt" size={t.z(36)} color={accent} />
          </View>
        </Animated.View>
        <Text
          accessibilityRole="header"
          style={{
            color: '#fff',
            fontSize: t.font(44),
            lineHeight: t.font(50),
            fontWeight: '900',
            fontFamily: Platform.OS === 'android' ? 'sans-serif-black' : undefined,
            letterSpacing: -1,
            textAlign: 'center',
            textShadowColor: withAlpha(accent, 0.9),
            textShadowRadius: 18,
            textShadowOffset: { width: 0, height: 2 },
          }}
        >
          {tr("FluxerHooks")}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.86)', fontSize: t.font(15), lineHeight: t.font(21), maxWidth: 520, textAlign: 'center' }}>
          {tr("Compose, prévisualise et publie tes messages sur Fluxer : webhooks, bots, embeds, threads et forums.")}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {['Embeds', 'Threads & forums', 'Bot en ligne', 'Automatisations'].map((x) => tr(x)).map((x) => (
            <View key={x} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }}>
              <Text style={{ color: '#fff', fontSize: t.font(12), fontWeight: '600' }}>{x}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Mini-carte carrée à coins arrondis (raccourci), avec infobulle à l'appui long. */
function Tile({ icon, label, hint, onPress, dot }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; hint: string; onPress: () => void; dot?: string }) {
  const { theme: t, haptic } = useSettings();
  const size = t.z(80);
  return (
    <Tip title={label} text={hint} trigger="longPress" onPress={() => { haptic('light'); onPress(); }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: t.radius,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          padding: 6,
        }}
      >
        <View>
          <MaterialCommunityIcons name={icon} size={t.z(24)} color={t.accent} />
          {dot && <View style={{ position: 'absolute', right: -4, top: -3, width: t.z(10), height: t.z(10), borderRadius: 99, backgroundColor: dot, borderWidth: 2, borderColor: t.surface }} />}
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: t.text, fontSize: t.font(10.5), fontWeight: '700', textAlign: 'center', width: '100%' }}>
          {label}
        </Text>
      </View>
    </Tip>
  );
}

/** Raccourcis de l'app en mini-cartes carrées (affichés dans « Mon profil Fluxer »). */
export function QuickTiles({ onOpenEditor, onAction }: { onOpenEditor: () => void; onAction: (a: LandingAction) => void }) {
  const { theme: t, botToken } = useSettings();
  const { backups } = useEditor();
  const { templates, automations } = useLibrary();
  const gw = useBotGateway();
  const activeAuto = automations.filter((a) => a.enabled).length;
  const botDot = !botToken ? undefined : gw.state.state === 'online' ? '#23A55A' : gw.state.state === 'error' ? t.danger : gw.state.state === 'offline' ? '#80848E' : '#F0B232';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <Tile icon="robot-outline" label={tr("Bot Fluxer")} dot={botDot} hint={!botToken ? 'Ajoute un bot dans l’éditeur.' : gw.state.state === 'online' ? `En ligne · ${gw.state.guilds ?? 0} serveur(s).` : 'Bot hors ligne.'} onPress={onOpenEditor} />
      <Tile icon="server-network" label={tr("Mes serveurs")} hint="Webhooks, salons, threads et forums." onPress={() => onAction('bot')} />
      <Tile icon="archive-outline" label={tr("Sauvegardes")} hint={`${backups.length} sauvegarde(s) · ${templates.length} modèle(s).`} onPress={() => onAction('data')} />
      <Tile icon="clock-fast" label={tr("Automatisations")} hint={activeAuto ? `${activeAuto} automatisation(s) active(s).` : 'Envois programmés.'} onPress={() => onAction('data')} />
      <Tile icon="code-json" label="JSON" hint="Importer / exporter, compatible Discohook." onPress={() => onAction('json')} />
      <Tile icon="palette-outline" label={tr("Styles")} hint="Thème, variables et CSS." onPress={() => onAction('css')} />
    </View>
  );
}

/** Page d'accueil : bannière animée et bouton « Créer un message ». */
export function LandingPage({ onOpenEditor, onAction }: { onOpenEditor: () => void; onAction: (a: LandingAction) => void }) {
  const { theme: t, haptic } = useSettings();
  const insets = useSafeAreaInsets();
  const ep = useEndpoints();
  const session = useSession();
  const { state } = useEditor();
  const { activeTargets } = useSender();
  const targets = activeTargets().length;
  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: t.gap,
        gap: t.gap + 8,
        alignSelf: 'center',
        width: '100%',
        maxWidth: 900,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: t.textMuted, fontWeight: '800', fontSize: t.font(12), letterSpacing: 1 }}>{tr("BIENVENUE")}{session.user ? `, ${(session.user.global_name || session.user.username).toUpperCase()}` : ''}</Text>
        <Pressable onPress={() => onAction('account')} accessibilityLabel="Mon profil Fluxer" hitSlop={6} style={{ padding: 4 }}>
          {session.user ? (
            <Avatar uri={avatarUrl(ep, session.user.id, session.user.avatar)} name={session.user.global_name || session.user.username} size={t.z(32)} />
          ) : (
            <Ionicons name="person-circle-outline" size={t.z(30)} color={t.text} />
          )}
        </Pressable>
        <Pressable onPress={() => onAction('settings')} accessibilityLabel="Paramètres" hitSlop={6} style={{ padding: 4 }}>
          <Ionicons name="settings-sharp" size={t.z(24)} color={t.text} />
        </Pressable>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', gap: t.gap + 10 }}>
        <Hero />

        <View style={{ alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={() => {
              haptic('light');
              onOpenEditor();
            }}
            accessibilityRole="button"
            accessibilityLabel={tr("Créer un message")}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: t.z(15),
              paddingHorizontal: t.z(28),
              borderRadius: 999,
              backgroundColor: pressed ? t.accentPressed : t.accent,
              transform: [{ scale: pressed ? 0.96 : 1 }],
              elevation: 8,
              shadowColor: t.accent,
              shadowOpacity: 0.5,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
            })}
          >
            <MaterialCommunityIcons name="message-plus-outline" size={t.z(22)} color={t.onAccent} />
            <Text style={{ color: t.onAccent, fontWeight: '900', fontSize: t.font(17) }}>{tr("Créer un message")}</Text>
          </Pressable>
          <Text style={{ color: t.textMuted, fontSize: t.font(12), textAlign: 'center' }}>
            {tr(state.messages.length > 1 ? '{n} brouillons' : '{n} brouillon', { n: state.messages.length })} · {targets ? tr(targets > 1 ? '{n} destinations' : '{n} destination', { n: targets }) : tr('aucune destination')}
          </Text>
        </View>
      </View>

      <Text style={{ color: t.textFaint, fontSize: t.font(12), textAlign: 'center' }}>FluxerHooks {version} · {tr('non affilié à Fluxer')}</Text>
    </ScrollView>
  );
}
