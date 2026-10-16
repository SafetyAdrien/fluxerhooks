import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
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
import { Avatar, Grid } from '../components/ui';
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
  const h = t.z(300);
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

      <View style={{ flex: 1, justifyContent: 'flex-end', padding: t.z(22), gap: 10 }}>
        <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }], alignSelf: 'flex-start' }}>
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
            fontSize: t.font(40),
            lineHeight: t.font(46),
            fontWeight: '900',
            letterSpacing: -1,
            textShadowColor: withAlpha(accent, 0.9),
            textShadowRadius: 18,
            textShadowOffset: { width: 0, height: 2 },
          }}
        >
          FluxerHooks
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.86)', fontSize: t.font(15), lineHeight: t.font(21), maxWidth: 520 }}>
          Compose, prévisualise et publie tes messages sur Fluxer : webhooks, bots, embeds, threads et forums.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {['Embeds', 'Threads & forums', 'Bot en ligne', 'Automatisations'].map((x) => (
            <View key={x} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }}>
              <Text style={{ color: '#fff', fontSize: t.font(12), fontWeight: '600' }}>{x}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Shortcut({ icon, title, subtitle, onPress, dot }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; title: string; subtitle: string; onPress: () => void; dot?: string }) {
  const { theme: t, haptic } = useSettings();
  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: t.z(14),
        borderRadius: t.radius,
        backgroundColor: pressed ? t.surface2 : t.surface,
        borderWidth: 1,
        borderColor: t.border,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View style={{ width: t.z(42), height: t.z(42), borderRadius: t.radiusSm, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={icon} size={t.z(22)} color={t.accent} />
        {dot && <View style={{ position: 'absolute', right: -2, top: -2, width: t.z(12), height: t.z(12), borderRadius: 99, backgroundColor: dot, borderWidth: 2, borderColor: t.surface }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.font(15) }}>{title}</Text>
        <Text numberOfLines={2} style={{ color: t.textMuted, fontSize: t.font(12) }}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={t.z(18)} color={t.textFaint} />
    </Pressable>
  );
}

/** Page d'accueil : bannière animée, accès à l'éditeur et raccourcis. */
export function LandingPage({ onOpenEditor, onAction }: { onOpenEditor: () => void; onAction: (a: LandingAction) => void }) {
  const { theme: t, botToken, haptic } = useSettings();
  const insets = useSafeAreaInsets();
  const ep = useEndpoints();
  const session = useSession();
  const { state, backups } = useEditor();
  const { templates, automations } = useLibrary();
  const gw = useBotGateway();
  const { activeTargets } = useSender();
  const targets = activeTargets().length;
  const activeAuto = automations.filter((a) => a.enabled).length;
  const botDot = !botToken ? undefined : gw.state.state === 'online' ? '#23A55A' : gw.state.state === 'error' ? t.danger : gw.state.state === 'offline' ? '#80848E' : '#F0B232';
  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: t.gap, gap: t.gap + 4, alignSelf: 'center', width: '100%', maxWidth: 900 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, color: t.textMuted, fontWeight: '800', fontSize: t.font(12), letterSpacing: 1 }}>BIENVENUE{session.user ? `, ${(session.user.global_name || session.user.username).toUpperCase()}` : ''}</Text>
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

      <Hero />

      <Pressable
        onPress={() => {
          haptic('light');
          onOpenEditor();
        }}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir l’éditeur"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: t.z(18),
          borderRadius: t.radius + 4,
          backgroundColor: pressed ? t.accentPressed : t.accent,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          elevation: 6,
          shadowColor: t.accent,
          shadowOpacity: 0.45,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        })}
      >
        <View style={{ width: t.z(48), height: t.z(48), borderRadius: t.radiusSm, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="pencil-ruler" size={t.z(26)} color={t.onAccent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.onAccent, fontWeight: '900', fontSize: t.font(18) }}>Ouvrir l’éditeur</Text>
          <Text numberOfLines={1} style={{ color: withAlpha(t.onAccent, 0.85), fontSize: t.font(13) }}>
            {state.messages.length} message{state.messages.length > 1 ? 's' : ''} en brouillon · {targets ? `${targets} destination${targets > 1 ? 's' : ''}` : 'aucune destination'}
          </Text>
        </View>
        <MaterialCommunityIcons name="arrow-right" size={t.z(24)} color={t.onAccent} />
      </Pressable>

      <Text style={{ color: t.textMuted, fontWeight: '800', fontSize: t.font(12), letterSpacing: 0.8, marginTop: 4 }}>RACCOURCIS</Text>
      <Grid min={260} gap={10}>
        <Shortcut icon="robot-outline" title="Bot Fluxer" dot={botDot} subtitle={!botToken ? 'Ajouter un bot dans l’éditeur' : gw.state.state === 'online' ? `En ligne · ${gw.state.guilds ?? 0} serveur(s)` : 'Hors ligne'} onPress={onOpenEditor} />
        <Shortcut icon="server-network" title="Mes serveurs" subtitle="Webhooks, salons, threads et forums" onPress={() => onAction('bot')} />
        <Shortcut icon="archive-outline" title="Sauvegardes et modèles" subtitle={`${backups.length} sauvegarde(s) · ${templates.length} modèle(s)`} onPress={() => onAction('data')} />
        <Shortcut icon="clock-fast" title="Automatisations" subtitle={activeAuto ? `${activeAuto} active(s)` : 'Envois programmés'} onPress={() => onAction('data')} />
        <Shortcut icon="code-json" title="Importer / exporter JSON" subtitle="Compatible Discohook" onPress={() => onAction('json')} />
        <Shortcut icon="palette-outline" title="Couleurs et styles" subtitle="Thème, variables et CSS" onPress={() => onAction('css')} />
      </Grid>
      <Text style={{ color: t.textFaint, fontSize: t.font(12), textAlign: 'center', marginTop: 8 }}>FluxerHooks-{version} · non affilié à Fluxer</Text>
    </ScrollView>
  );
}
