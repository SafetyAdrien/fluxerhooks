import React, { useState } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { useSender } from '../state/useSender';
import { BotCard, TargetsEditor } from '../components/TargetsEditor';
import { MessageEditor } from '../components/MessageEditor';
import { PreviewList } from '../components/Preview';
import { Button, IconBtn, Segmented, Stack } from '../components/ui';
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
  const [tab, setTab] = useState<Tab>('editor');
  const [sheet, setSheet] = useState<null | 'settings' | 'bot' | 'json' | 'data' | 'account' | 'css'>(null);

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
      {/* Barre supérieure */}
      <View
        style={[
          {
            paddingTop: insets.top + 6,
            paddingBottom: 8,
            paddingHorizontal: 12,
            backgroundColor: t.bgAlt,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
            gap: 8,
          },
          t.css.header,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: t.z(34), height: t.z(34), borderRadius: 10, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flash" size={t.z(20)} color={t.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '900', fontSize: t.font(18) }}>FluxerHooks</Text>
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(11) }}>
              {targets ? `${targets} webhook(s) prêt(s)` : 'Aucun webhook configuré'}
            </Text>
          </View>
          <IconBtn icon="archive-outline" label="Sauvegardes, modèles et automatisations" onPress={() => setSheet('data')} />
          <IconBtn icon="code-slash-outline" label="JSON" onPress={() => setSheet('json')} />
          <Pressable onPress={() => setSheet('account')} accessibilityLabel="Mon profil Fluxer" hitSlop={6} style={{ padding: 4 }}>
            {session.user ? (
              <Avatar uri={avatarUrl(ep, session.user.id, session.user.avatar)} name={session.user.global_name || session.user.username} size={t.z(28)} />
            ) : (
              <Ionicons name="person-circle-outline" size={t.z(26)} color={t.text} />
            )}
          </Pressable>
          <IconBtn icon="settings-sharp" label="Paramètres" color={t.text} size={22} onPress={() => setSheet('settings')} />
        </View>
        {!split && (
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'editor', label: 'Éditeur', icon: 'create-outline' },
              { value: 'preview', label: 'Aperçu', icon: 'eye-outline' },
            ]}
          />
        )}
      </View>

      {/* Contenu : onglets sur téléphone, écran partagé sur tablette / paysage */}
      {split ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: t.border }}>{editor}</View>
          <View style={{ flex: 1 }}>{preview}</View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>{tab === 'editor' ? editor : preview}</View>
      )}

      {/* Barre d'action flottante */}
      <View
        style={[
          {
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: insets.bottom + 12,
            flexDirection: 'row',
            gap: 8,
            padding: 8,
            borderRadius: t.radius + 4,
            backgroundColor: t.hasWallpaper ? base.bgAlt : t.bgAlt,
            borderWidth: 1,
            borderColor: t.border,
            elevation: 10,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          },
          t.css.actionbar,
        ]}
      >
        {!split && (
          <Button
            icon={tab === 'editor' ? 'eye-outline' : 'create-outline'}
            onPress={() => setTab(tab === 'editor' ? 'preview' : 'editor')}
          />
        )}
        <Button
          flex
          variant="primary"
          icon={hasEdits ? 'save' : 'paper-plane'}
          label={
            state.messages.length > 1
              ? `${hasEdits ? 'Envoyer / mettre à jour' : 'Tout envoyer'} (${state.messages.length})`
              : hasEdits
                ? 'Mettre à jour'
                : 'Envoyer'
          }
          onPress={sendAll}
          loading={busy === 'all'}
          disabled={!targets}
        />
      </View>

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
