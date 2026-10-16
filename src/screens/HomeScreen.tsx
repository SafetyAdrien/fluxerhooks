import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, Easing, Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LandingPage, type LandingAction } from './LandingPage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { useSender } from '../state/useSender';
import { BotCard, TargetsEditor } from '../components/TargetsEditor';
import { MessageEditor } from '../components/MessageEditor';
import { PreviewList } from '../components/Preview';
import { Button, IconBtn, Stack } from '../components/ui';
import { SettingsSheet } from './SettingsSheet';
import { BotBrowser } from './BotBrowser';
import { JsonSheet } from './DataSheets';
import { DataHubSheet } from './DataHubSheet';
import { AccountSheet } from './AccountSheet';
import { CssEditorSheet } from './CssEditorSheet';
import { useSession } from '../state/session';
import { useEndpoints } from '../state/useEndpoints';
import { avatarUrl } from '../api/fluxer';
import { Avatar } from '../components/ui';
import { Pressable } from 'react-native';

type Tab = 'editor' | 'preview';

export function HomeScreen({ onRestored }: { onRestored: () => void }) {
  const { theme: t, settings, base } = useSettings();
  const session = useSession();
  const ep = useEndpoints();
  const wp = settings.wallpaper;
  const { state, addMessage, setAllCollapsed } = useEditor();
  const { busy, sendAll, activeTargets } = useSender();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [sheet, setSheet] = useState<null | 'settings' | 'bot' | 'json' | 'data' | 'account' | 'css'>(null);
  const [tab, setTab] = useState<Tab>('editor');
  const [page, setPage] = useState<'home' | 'editor'>('home');
  // Transition douce entre l'accueil et l'éditeur.
  const fade = useRef(new Animated.Value(1)).current;
  const go = (p: 'home' | 'editor') => {
    fade.setValue(0);
    setPage(p);
    if (p === 'home') setTab('editor');
    Animated.timing(fade, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  // Bouton retour Android : aperçu → éditeur → accueil.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) return false;
      if (page === 'editor' && tab === 'preview') {
        setTab('editor');
        return true;
      }
      if (page === 'editor') {
        go('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tab, sheet]);

  const split = settings.splitView === 'auto' && (width >= 760 || (width > height && width >= 640));
  const info = state.targets.find((x) => x.enabled && x.info)?.info;
  const targets = activeTargets().length;
  const allCollapsed = state.messages.every((m) => m.collapsed);
  const hasEdits = state.messages.some((m) => m.reference.trim());

  const editor = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: t.gap, gap: t.gap, paddingBottom: 120 }}
    >
      <TargetsEditor onBrowse={() => setSheet('bot')} />
      <BotCard onBrowse={() => setSheet('bot')} />
      <Stack row gap={4}>
        <Text style={{ flex: 1, color: t.textMuted, fontWeight: '800', fontSize: t.font(12), letterSpacing: 0.6 }}>
          MESSAGES · {state.messages.length}
        </Text>
        <IconBtn
          icon={allCollapsed ? 'chevron-expand-outline' : 'chevron-collapse-outline'}
          label={allCollapsed ? 'Tout déplier' : 'Tout replier'}
          onPress={() => setAllCollapsed(!allCollapsed)}
        />
      </Stack>
      {state.messages.map((m, i) => (
        <MessageEditor key={m.id} m={m} index={i} count={state.messages.length} info={info} />
      ))}
      <Button icon="add" label="Ajouter un message" onPress={() => addMessage()} />
    </ScrollView>
  );

  const preview = (
    <ScrollView contentContainerStyle={{ padding: t.gap, gap: t.gap, paddingBottom: 120 }}>
      {info && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
          <Ionicons name="chatbox-outline" size={16} color={t.textMuted} />
          <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(13) }}>
            {info.channelName ?? `Salon ${info.channel_id}`}
          </Text>
        </View>
      )}
      <PreviewList messages={state.messages} info={info} />
      <Text style={{ color: t.textFaint, fontSize: t.font(12), textAlign: 'center' }}>
        Aperçu indicatif : le rendu final dépend du client Fluxer.
      </Text>
    </ScrollView>
  );

  return (
    <View style={[{ flex: 1, backgroundColor: base.bg }, t.css.app]}>
      {/* Fond d'écran personnalisé, assombri (« DIM ») */}
      {!!wp.uri && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Image source={{ uri: wp.uri }} blurRadius={wp.blur} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: wp.tint === 'accent' ? t.accent : '#000', opacity: wp.dim }} />
        </View>
      )}
      {page === 'home' ? (
        <Animated.View style={{ flex: 1, opacity: fade }}>
          <LandingPage onOpenEditor={() => go('editor')} onAction={(a: LandingAction) => setSheet(a)} />
        </Animated.View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateX: fade.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
          {/* Barre supérieure de l'éditeur */}
          <View
            style={[
              {
                paddingTop: insets.top + 6,
                paddingBottom: 8,
                paddingHorizontal: 10,
                backgroundColor: t.bgAlt,
                borderBottomWidth: 1,
                borderBottomColor: t.border,
              },
              t.css.header,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                onPress={() => go('home')}
                accessibilityRole="button"
                accessibilityLabel="Retour à l’accueil"
                hitSlop={6}
                style={({ pressed }) => ({
                  width: t.z(40),
                  height: t.z(40),
                  borderRadius: t.z(14),
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? t.accentSoft : t.surface2,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                })}
              >
                <MaterialCommunityIcons name="arrow-left" size={t.z(22)} color={t.text} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
                <Text numberOfLines={1} style={{ color: t.text, fontWeight: '900', fontSize: t.font(17) }}>
                  {tab === 'preview' && !split ? 'Aperçu' : 'Éditeur'}
                </Text>
                <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(11) }}>
                  {targets ? `${targets} destination${targets > 1 ? 's prêtes' : ' prête'}` : 'Aucune destination'}
                </Text>
              </View>
              <IconBtn icon="archive-outline" label="Sauvegardes, modèles et automatisations" onPress={() => setSheet('data')} />
              <IconBtn icon="code-slash-outline" label="JSON" onPress={() => setSheet('json')} />
              <Pressable onPress={() => setSheet('account')} accessibilityLabel="Mon profil Fluxer" hitSlop={6} style={{ padding: 4 }}>
                {session.user ? (
                  <Avatar uri={avatarUrl(ep, session.user.id, session.user.avatar)} name={session.user.global_name || session.user.username} size={t.z(26)} />
                ) : (
                  <Ionicons name="person-circle-outline" size={t.z(25)} color={t.text} />
                )}
              </Pressable>
              <IconBtn icon="settings-sharp" label="Paramètres" color={t.text} size={21} onPress={() => setSheet('settings')} />
              {/* Envoyer : déplacé dans la barre supérieure */}
              <Pressable
                onPress={sendAll}
                disabled={!targets || busy === 'all'}
                accessibilityRole="button"
                accessibilityLabel={hasEdits ? 'Envoyer et mettre à jour' : state.messages.length > 1 ? 'Tout envoyer' : 'Envoyer'}
                style={({ pressed }) => ({
                  height: t.z(40),
                  minWidth: t.z(40),
                  paddingHorizontal: t.z(10),
                  borderRadius: t.z(14),
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  backgroundColor: !targets ? t.surface2 : pressed ? t.accentPressed : t.accent,
                  opacity: !targets ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                })}
              >
                {busy === 'all' ? (
                  <ActivityIndicator size="small" color={t.onAccent} />
                ) : (
                  <MaterialCommunityIcons name={hasEdits ? 'content-save-outline' : 'send'} size={t.z(20)} color={targets ? t.onAccent : t.textMuted} />
                )}
                {state.messages.length > 1 && (
                  <Text style={{ color: targets ? t.onAccent : t.textMuted, fontWeight: '800', fontSize: t.font(13) }}>{state.messages.length}</Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* Contenu : éditeur ou aperçu sur téléphone, écran partagé sur tablette / paysage */}
          {split ? (
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: t.border }}>{editor}</View>
              <View style={{ flex: 1 }}>{preview}</View>
            </View>
          ) : (
            <View style={{ flex: 1 }}>{tab === 'editor' ? editor : preview}</View>
          )}

          {/* Aperçu : bouton flottant */}
          {!split && (
            <Pressable
              onPress={() => setTab(tab === 'editor' ? 'preview' : 'editor')}
              accessibilityRole="button"
              accessibilityLabel={tab === 'editor' ? 'Afficher l’aperçu' : 'Revenir à l’éditeur'}
              style={({ pressed }) => [
                {
                  position: 'absolute',
                  right: 18,
                  bottom: insets.bottom + 18,
                  width: t.z(60),
                  height: t.z(60),
                  borderRadius: t.z(30),
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? '#3732B8' : '#4641D9',
                  transform: [{ scale: pressed ? 0.92 : 1 }],
                  elevation: 10,
                  shadowColor: '#4641D9',
                  shadowOpacity: 0.5,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                },
              ]}
            >
              <MaterialCommunityIcons name={tab === 'editor' ? 'eye-outline' : 'pencil-outline'} size={t.z(28)} color="#FFFFFF" />
            </Pressable>
          )}
        </Animated.View>
      )}

      <SettingsSheet
        visible={sheet === 'settings'}
        onClose={() => setSheet(null)}
        onOpenBot={() => setSheet('bot')}
        onOpenAccount={() => setSheet('account')}
        onOpenJson={() => setSheet('json')}
        onOpenData={() => setSheet('data')}
        onOpenCss={() => setSheet('css')}
      />
      {sheet === 'bot' && <BotBrowser visible onClose={() => setSheet(null)} onOpenAccount={() => setSheet('account')} />}
      {sheet === 'json' && <JsonSheet visible onClose={() => setSheet(null)} />}
      {sheet === 'data' && <DataHubSheet visible onClose={() => setSheet(null)} onRestored={onRestored} />}
      {sheet === 'account' && <AccountSheet visible onClose={() => setSheet(null)} onBrowse={() => setSheet('bot')} />}
      {sheet === 'css' && <CssEditorSheet visible onClose={() => setSheet(null)} />}
    </View>
  );
}
