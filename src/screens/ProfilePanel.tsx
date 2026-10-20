import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentLocale, tr } from '../i18n';
import { useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { useLibrary } from '../state/library';
import { buildItems, filterItems, type LibraryItem } from '../state/libraryItems';
import { cloneMessage, newMessage } from '../utils/factory';
import { GUIDES, type Guide, type GuideBlock } from '../content/guides';
import { Markdown } from '../components/Markdown';
import { Button, IconBtn, Segmented, useToast, type IconName } from '../components/ui';

/**
 * Panneau latéral du profil (s'ouvre à droite) : accès rapide aux sauvegardes et guides
 * d'utilisation de FluxerHooks (rédaction, mise en forme, embeds…).
 */
type Tab = 'saves' | 'guides';

function SavesTab({ onOpenEditor, onManage }: { onOpenEditor: () => void; onManage: () => void }) {
  const { theme: t } = useSettings();
  const { state, replace, backups, saveBackup } = useEditor();
  const { templates, folders } = useLibrary();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const items = useMemo(() => buildItems(backups, templates.filter((x) => !x.builtin)), [backups, templates]);
  const list = useMemo(() => filterItems(items, { scope: 'all', folder: null, tag: null, query, sort: 'updated' }, folders).slice(0, 40), [items, query, folders]);
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const open = (i: LibraryItem) =>
    Alert.alert(tr('Ouvrir « {name} » ?', { name: i.name }), i.kind === 'backup' ? tr('Le brouillon actuel sera remplacé (messages et destinations).') : tr('Les messages du brouillon seront remplacés ; les destinations sont conservées.'), [
      { text: tr('Annuler'), style: 'cancel' },
      {
        text: tr('Ouvrir'),
        onPress: () => {
          if (i.kind === 'backup') {
            const b = backups.find((x) => x.id === i.id);
            if (b) replace(JSON.parse(JSON.stringify(b.state)));
          } else replace({ ...state, messages: i.messages.map(cloneMessage) });
          toast(tr('« {name} » ouvert dans l’éditeur.', { name: i.name }), 'success');
          onOpenEditor();
        },
      },
    ]);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: t.z(40), paddingHorizontal: 10, borderRadius: t.radiusSm, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border }}>
          <Ionicons name="save-outline" size={t.z(16)} color={t.textFaint} />
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder={tr('Nom de la sauvegarde')}
            placeholderTextColor={t.textFaint}
            accessibilityLabel={tr('Nom de la sauvegarde')}
            style={[{ flex: 1, minWidth: 0, color: t.text, fontSize: t.font(14), paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
          />
        </View>
        <Button
          small
          variant="primary"
          icon="save"
          label="Enregistrer"
          onPress={() => {
            saveBackup(name);
            setName('');
            toast('Brouillon sauvegardé.', 'success');
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: t.z(38), paddingHorizontal: 10, borderRadius: t.radiusSm, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border }}>
        <Ionicons name="search" size={t.z(16)} color={t.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tr('Rechercher…')}
          placeholderTextColor={t.textFaint}
          accessibilityLabel={tr('Rechercher…')}
          style={[{ flex: 1, minWidth: 0, color: t.text, fontSize: t.font(14), paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
        />
      </View>
      {!list.length && (
        <Text style={{ color: t.textFaint, fontSize: t.font(13), textAlign: 'center', paddingVertical: 20 }}>
          {query ? tr('Aucun résultat') : tr('Aucune sauvegarde pour le moment.')}
        </Text>
      )}
      {list.map((i) => {
        const f = i.folder ? folderById.get(i.folder) : undefined;
        return (
          <Pressable
            key={i.key}
            onPress={() => open(i)}
            accessibilityRole="button"
            accessibilityLabel={i.name}
            style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: t.radiusSm, backgroundColor: pressed || hovered ? t.surface2 : t.surface, borderWidth: 1, borderColor: t.border })}
          >
            <View style={{ width: t.z(34), height: t.z(34), borderRadius: t.radiusSm, backgroundColor: i.kind === 'template' ? t.accentSoft : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={i.icon as IconName} size={t.z(17)} color={i.kind === 'template' ? t.accent : t.textMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                {i.pinned && <MaterialCommunityIcons name="pin" size={t.z(13)} color={t.accent} />}
                <Text numberOfLines={1} style={{ flexShrink: 1, color: t.text, fontWeight: '800', fontSize: t.font(14) }}>{i.name}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(11) }}>
                {[i.kind === 'backup' ? tr('Sauvegarde') : tr('Modèle'), tr(i.stats.messages === 1 ? '{n} message' : '{n} messages', { n: i.stats.messages }), f?.name, i.updatedAt ? new Date(i.updatedAt).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' }) : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="open-outline" size={t.z(16)} color={t.textFaint} />
          </Pressable>
        );
      })}
      <Button icon="albums-outline" label="Tout gérer dans Données" onPress={onManage} />
    </View>
  );
}

function Example({ code, label, onUse }: { code: string; label?: string; onUse: (code: string) => void }) {
  const { theme: t, base } = useSettings();
  const toast = useToast();
  return (
    <View style={{ borderRadius: t.radiusSm, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 10, backgroundColor: t.surface2 }}>
        <Text style={{ flex: 1, color: t.textMuted, fontSize: t.font(11), fontWeight: '800' }}>{label ? tr(label).toUpperCase() : ''}</Text>
        <IconBtn
          icon="copy-outline"
          label="Copier"
          size={16}
          onPress={async () => {
            await Clipboard.setStringAsync(tr(code));
            toast('Copié.', 'success');
          }}
        />
        <IconBtn icon="add-circle-outline" label="Ajouter au brouillon" size={16} onPress={() => onUse(tr(code))} />
      </View>
      <Text selectable style={{ color: t.text, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: t.font(12), padding: 10, backgroundColor: t.surface }}>
        {tr(code)}
      </Text>
      <View style={{ padding: 10, backgroundColor: base.preview, borderTopWidth: 1, borderTopColor: t.border }}>
        <Markdown text={tr(code)} size={14} />
      </View>
    </View>
  );
}

function GuideView({ guide, onUseExample, onUseTemplate }: { guide: Guide; onUseExample: (code: string) => void; onUseTemplate: (id: string) => void }) {
  const { theme: t } = useSettings();
  const { templates } = useLibrary();
  const block = (b: GuideBlock, i: number) => {
    if (b.type === 'p') return <Text key={i} style={{ color: t.text, fontSize: t.font(14), lineHeight: t.font(20) }}>{tr(b.text)}</Text>;
    if (b.type === 'list')
      return (
        <View key={i} style={{ gap: 6 }}>
          {b.items.map((it, j) => (
            <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent, marginTop: t.font(7) }} />
              <Text style={{ flex: 1, color: t.text, fontSize: t.font(14), lineHeight: t.font(20) }}>{tr(it)}</Text>
            </View>
          ))}
        </View>
      );
    if (b.type === 'example') return <Example key={i} code={b.code} label={b.label} onUse={onUseExample} />;
    return (
      <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {b.ids
          .map((id) => templates.find((x) => x.id === id))
          .filter(Boolean)
          .map((tpl) => (
            <Pressable
              key={tpl!.id}
              onPress={() => onUseTemplate(tpl!.id)}
              accessibilityRole="button"
              accessibilityLabel={tr('Ajouter le modèle {name} au brouillon', { name: tr(tpl!.name) })}
              style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: pressed || hovered ? t.accentSoft : t.surface2, borderWidth: 1, borderColor: t.border })}
            >
              <Ionicons name={tpl!.icon as IconName} size={t.z(15)} color={t.accent} />
              <Text style={{ color: t.text, fontSize: t.font(13), fontWeight: '600' }}>{tr(tpl!.name)}</Text>
            </Pressable>
          ))}
      </View>
    );
  };
  return <View style={{ gap: 12 }}>{guide.blocks.map(block)}</View>;
}

function GuidesTab({ onOpenEditor }: { onOpenEditor: () => void }) {
  const { theme: t } = useSettings();
  const { state, replace } = useEditor();
  const { templates } = useLibrary();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const guide = GUIDES.find((g) => g.id === open);
  const useExample = (code: string) => {
    replace({ ...state, messages: [...state.messages, { ...newMessage(), collapsed: false, content: code }] });
    toast('Exemple ajouté au brouillon.', 'success');
  };
  const useTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    replace({ ...state, messages: [...state.messages, ...tpl.messages.map(cloneMessage)] });
    toast(tr('Modèle « {name} » ajouté.', { name: tr(tpl.name) }), 'success');
    onOpenEditor();
  };
  if (guide)
    return (
      <View style={{ gap: 12 }}>
        <Pressable onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel={tr('Tous les guides')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}>
          <Ionicons name="chevron-back" size={t.z(16)} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: '700', fontSize: t.font(13) }}>{tr('Tous les guides')}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: t.z(40), height: t.z(40), borderRadius: t.radiusSm, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name={guide.icon as any} size={t.z(22)} color={t.accent} />
          </View>
          <Text style={{ flex: 1, color: t.text, fontSize: t.font(18), fontWeight: '900' }}>{tr(guide.title)}</Text>
        </View>
        <GuideView guide={guide} onUseExample={useExample} onUseTemplate={useTemplate} />
      </View>
    );
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(18) }}>{tr('Tout ce que tu peux faire avec les messages FluxerHooks, et comment bien les rédiger.')}</Text>
      {GUIDES.map((g) => (
        <Pressable
          key={g.id}
          onPress={() => setOpen(g.id)}
          accessibilityRole="button"
          accessibilityLabel={tr(g.title)}
          style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radius, backgroundColor: pressed || hovered ? t.surface2 : t.surface, borderWidth: 1, borderColor: t.border })}
        >
          <View style={{ width: t.z(38), height: t.z(38), borderRadius: t.radiusSm, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name={g.icon as any} size={t.z(20)} color={t.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: t.font(14) }}>{tr(g.title)}</Text>
            <Text numberOfLines={2} style={{ color: t.textMuted, fontSize: t.font(12) }}>{tr(g.summary)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={t.z(16)} color={t.textFaint} />
        </Pressable>
      ))}
    </View>
  );
}

export function ProfilePanel({ visible, onClose, onOpenEditor, onManage }: { visible: boolean; onClose: () => void; onOpenEditor: () => void; onManage: () => void }) {
  const { theme: t, base } = useSettings();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelW = Math.min(440, Math.round(width * 0.9));
  const [tab, setTab] = useState<Tab>('saves');
  const [shown, setShown] = useState(visible);
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      setShown(true);
      Animated.timing(slide, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (shown) {
      Animated.timing(slide, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setShown(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  if (!shown) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', opacity: slide }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={tr('Fermer')} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: panelW,
            backgroundColor: base.bg,
            borderLeftWidth: 1,
            borderLeftColor: t.border,
            paddingTop: insets.top + 8,
            elevation: 20,
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 24,
            shadowOffset: { width: -6, height: 0 },
            transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [panelW, 0] }) }],
          },
          t.css.sheet,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 8, gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'saves', label: 'Sauvegardes', icon: 'archive-outline' },
                { value: 'guides', label: 'Guides', icon: 'book-outline' },
              ]}
            />
          </View>
          <IconBtn icon="close" label="Fermer" onPress={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, paddingTop: 6, paddingBottom: insets.bottom + 32 }}>
          {tab === 'saves' ? <SavesTab onOpenEditor={onOpenEditor} onManage={onManage} /> : <GuidesTab onOpenEditor={onOpenEditor} />}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
