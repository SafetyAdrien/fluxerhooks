import { APP_VERSION } from '../version';
import React, { useState } from 'react';
import { Alert, Image, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LANGUAGES, resolveLanguage, tr } from '../i18n';
import { LanguagePicker } from '../components/LanguagePicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { persistImage, removePersisted } from '../platform/files';
import Constants from 'expo-constants';
import { DEFAULT_MESSAGE_STYLE, DEFAULT_WALLPAPER, useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { useSession } from '../state/session';
import { PALETTES, ACCENTS } from '../theme/themes';
import { clearEndpointCache, resolveEndpoints } from '../api/fluxer';
import { hexToInt, intToHex } from '../utils/parse';
import { Box, Button, Grid, Input, ListRow, Segmented, Sheet, Slider, Stack, ToggleRow, useToast } from '../components/ui';
import { ColorPickerModal } from '../components/ColorPicker';
import { MessagePreview } from '../components/Preview';
import { newEmbed, newMessage } from '../utils/factory';
import type { MessageStyle, ThemeName, WallpaperSettings } from '../types';
import { DataTransfer } from '../components/DataTransfer';
import { DevicesSection } from '../link/DevicesSection';

function ThemeCard({ name, label, selected, onPress }: { name: ThemeName; label: string; selected: boolean; onPress: () => void }) {
  const { theme: t } = useSettings();
  const p = name === 'system' ? null : PALETTES[name];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{ borderRadius: t.radiusSm, borderWidth: 2, borderColor: selected ? t.accent : t.border, overflow: 'hidden' }}
    >
      <View style={{ height: t.z(54), flexDirection: 'row' }}>
        {p ? (
          <>
            <View style={{ width: 18, backgroundColor: p.bgAlt }} />
            <View style={{ flex: 1, backgroundColor: p.bg, padding: 8, gap: 5 }}>
              <View style={{ height: 8, width: '70%', borderRadius: 4, backgroundColor: p.surface2 }} />
              <View style={{ height: 8, width: '45%', borderRadius: 4, backgroundColor: t.accent }} />
              <View style={{ height: 8, width: '60%', borderRadius: 4, backgroundColor: p.surface2 }} />
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1, backgroundColor: PALETTES.light.bg }} />
            <View style={{ flex: 1, backgroundColor: PALETTES.dark.bg }} />
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: t.surface }}>
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={t.z(16)} color={selected ? t.accent : t.textFaint} />
        <Text style={{ color: t.text, fontWeight: '600', fontSize: t.font(13) }}>{label}</Text>
      </View>
    </Pressable>
  );
}

const SAMPLE = (() => {
  const m = newMessage();
  m.content = 'Aperçu du **style des messages** avec une <@&1> mention.';
  const e = newEmbed();
  e.title = 'Exemple d’embed';
  e.description = 'Les réglages s’appliquent en direct.';
  e.color = 0x4641d9;
  m.embeds = [e];
  return m;
})();

export function SettingsSheet({
  visible,
  onClose,
  onOpenBot,
  onOpenAccount,
  onOpenJson,
  onOpenData,
  onOpenCss,
  onRestored,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenBot: () => void;
  onOpenAccount: () => void;
  onOpenJson: () => void;
  onOpenData: () => void;
  onOpenCss: () => void;
  onRestored: () => void;
}) {
  const { theme: t, settings, update, reset } = useSettings();
  const { clearAll } = useEditor();
  const session = useSession();
  const toast = useToast();
  const [instance, setInstance] = useState(settings.instance);
  const [testing, setTesting] = useState(false);
  const [accentOpen, setAccentOpen] = useState(false);
  const wp = settings.wallpaper;
  const ms = settings.messageStyle;
  const setWp = (p: Partial<WallpaperSettings>) => update({ wallpaper: { ...wp, ...p } });
  const setMs = (p: Partial<MessageStyle>) => update({ messageStyle: { ...ms, ...p } });
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const themes: { name: ThemeName; label: string }[] = [
    { name: 'dark', label: 'Sombre' },
    { name: 'light', label: 'Clair' },
    { name: 'amoled', label: 'AMOLED' },
    { name: 'fluxer', label: 'Indigo' },
    { name: 'midnight', label: 'Minuit' },
    { name: 'system', label: 'Système' },
  ];

  const pickWallpaper = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (res.canceled) return;
      // On copie l'image dans le stockage de l'app pour qu'elle survive au nettoyage du cache.
      const dest = await persistImage(res.assets[0].uri, 'wallpaper', (res.assets[0] as any).file);
      removePersisted(wp.uri);
      setWp({ uri: dest });
      toast('Fond d’écran appliqué.', 'success');
    } catch {
      toast('Impossible d’ouvrir la galerie.', 'error');
    }
  };

  const testInstance = async () => {
    setTesting(true);
    const url = instance.trim().replace(/\/+$/, '') || 'https://fluxer.app';
    clearEndpointCache();
    const ep = await resolveEndpoints(url);
    setTesting(false);
    update({ instance: url });
    toast(`API : ${ep.api}`, 'success');
  };

  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const [langOpen, setLangOpen] = useState(false);
  const langInfo = LANGUAGES.find((l) => l.code === resolveLanguage(settings.language))!;

  return (
    <Sheet visible={visible} onClose={onClose} title="Paramètres" fullscreen>
      {/* ---------- Langue ---------- */}
      <Pressable
        onPress={() => setLangOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={tr('Langue')}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: t.pad,
          borderRadius: t.radius,
          backgroundColor: pressed ? t.surface2 : t.surface,
          borderWidth: 1,
          borderColor: t.border,
        })}
      >
        <View style={{ width: t.z(40), height: t.z(40), borderRadius: t.radiusSm, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="translate" size={t.z(22)} color={t.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: t.font(15) }}>{tr('Langue')}</Text>
          <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>
            {settings.language === 'system' ? `${tr('Langue du système')} · ${langInfo.flag} ${langInfo.native}` : `${langInfo.flag} ${langInfo.native}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={t.z(18)} color={t.textFaint} />
      </Pressable>
      {langOpen && <LanguagePicker onClose={() => setLangOpen(false)} />}

      {/* ---------- Thème ---------- */}
      <Box title="Thème et couleur" icon="color-palette-outline">
        <Grid min={100} gap={8}>
          {themes.map((x) => (
            <ThemeCard key={x.name} name={x.name} label={tr(x.label)} selected={settings.theme === x.name} onPress={() => update({ theme: x.name })} />
          ))}
        </Grid>
        <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>{tr("Couleur d’accent")}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Pressable
            onPress={() => setAccentOpen(true)}
            accessibilityLabel="Couleur d’accent personnalisée"
            style={{ width: t.z(38), height: t.z(38), borderRadius: t.z(19), overflow: 'hidden', borderWidth: 2, borderColor: t.text }}
          >
            <LinearGradient colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={t.z(20)} color="#fff" />
            </LinearGradient>
          </Pressable>
          {ACCENTS.map((c) => (
            <Pressable
              key={c}
              onPress={() => update({ accent: c })}
              accessibilityLabel={`Accent ${c}`}
              style={{
                width: t.z(38),
                height: t.z(38),
                borderRadius: t.z(19),
                backgroundColor: c,
                borderWidth: settings.accent.toLowerCase() === c.toLowerCase() ? 3 : 0,
                borderColor: t.text,
              }}
            />
          ))}
        </View>
        <ColorPickerModal
          visible={accentOpen}
          value={hexToInt(settings.accent)}
          allowNone={false}
          title="Couleur d’accent"
          onClose={() => setAccentOpen(false)}
          onPick={(c) => c !== null && update({ accent: intToHex(c) })}
        />
      </Box>

      {/* ---------- CSS ---------- */}
      <Box title="Styles personnalisés (CSS)" icon="code-slash-outline" collapsible={false}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>
          {tr("Personnalise chaque partie de l’interface par catégorie : structure, composants, texte, champs et aperçu.")}
        </Text>
        <Button icon="color-wand-outline" label="Couleurs et styles" onPress={go(onOpenCss)} />
      </Box>

      {/* ---------- Zoom & interface ---------- */}
      <Box title="Zoom et interface" icon="phone-portrait-outline" subtitle={`Zoom ${pct(settings.zoom)}`}>
        <Slider icon="search-outline" label="Zoom de l’interface" value={settings.zoom} min={0.8} max={1.4} step={0.05} format={pct} onChange={(v) => update({ zoom: v })} />
        <Slider icon="text-outline" label="Taille du texte" value={settings.fontScale} min={0.85} max={1.3} step={0.05} format={pct} onChange={(v) => update({ fontScale: v })} />
        <Slider icon="square-outline" label="Arrondi des conteneurs" value={settings.radius} min={0} max={24} step={2} format={(v) => `${v} px`} onChange={(v) => update({ radius: v })} />
        <Segmented
          value={settings.density}
          onChange={(v) => update({ density: v })}
          options={[
            { value: 'comfortable', label: 'Confortable', icon: 'resize-outline' },
            { value: 'compact', label: 'Compacte', icon: 'contract-outline' },
          ]}
        />
        <ToggleRow icon="tablet-landscape-outline" label="Écran partagé" description="Éditeur et aperçu côte à côte sur tablette et en paysage" value={settings.splitView === 'auto'} onChange={(v) => update({ splitView: v ? 'auto' : 'off' })} />
        <ToggleRow icon="calculator-outline" label="Compteurs de caractères" value={settings.showCounters} onChange={(v) => update({ showCounters: v })} />
      </Box>

      {/* ---------- Fond d'écran DIM ---------- */}
      <Box title="Fond d’écran (DIM)" icon="image-outline" subtitle={wp.uri ? `Assombri à ${pct(wp.dim)}` : 'Aucun'} defaultCollapsed={!wp.uri}>
        <View style={{ borderRadius: t.radiusSm, overflow: 'hidden', aspectRatio: 16 / 9, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border }}>
          {wp.uri ? (
            <>
              <Image source={{ uri: wp.uri }} blurRadius={wp.blur} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: wp.tint === 'accent' ? t.accent : '#000', opacity: wp.dim }} />
              <View style={{ margin: 12, padding: 10, borderRadius: t.radiusSm, backgroundColor: t.surface, alignSelf: 'flex-start' }}>
                <Text style={{ color: t.text, fontWeight: '700' }}>{tr("Aperçu d’un conteneur")}</Text>
              </View>
            </>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Ionicons name="images-outline" size={t.z(32)} color={t.textFaint} />
              <Text style={{ color: t.textMuted }}>{tr("Choisis une image de ta galerie")}</Text>
            </View>
          )}
        </View>
        <Stack row gap={8}>
          <Button flex icon="images-outline" label={wp.uri ? 'Changer' : 'Choisir une image'} onPress={pickWallpaper} />
          {!!wp.uri && <Button variant="danger" icon="trash-outline" onPress={() => setWp({ uri: null })} />}
        </Stack>
        {!!wp.uri && (
          <>
            <Slider icon="moon-outline" label="Assombrissement" value={wp.dim} min={0} max={0.9} step={0.05} format={pct} onChange={(v) => setWp({ dim: v })} />
            <Slider icon="water-outline" label="Flou" value={wp.blur} min={0} max={20} step={1} format={(v) => `${v}`} onChange={(v) => setWp({ blur: v })} />
            <Slider icon="layers-outline" label="Opacité des conteneurs" value={wp.surfaceOpacity} min={0.55} max={1} step={0.05} format={pct} onChange={(v) => setWp({ surfaceOpacity: v })} />
            <Segmented
              value={wp.tint}
              onChange={(v) => setWp({ tint: v })}
              options={[
                { value: 'black', label: 'Voile noir', icon: 'contrast-outline' },
                { value: 'accent', label: 'Voile accent', icon: 'color-fill-outline' },
              ]}
            />
            <Button variant="ghost" icon="refresh-outline" label="Valeurs par défaut" onPress={() => setWp({ ...DEFAULT_WALLPAPER, uri: wp.uri })} />
          </>
        )}
      </Box>

      {/* ---------- Apparence des messages ---------- */}
      <Box title="Apparence des messages" icon="chatbubbles-outline" defaultCollapsed>
        <View style={{ backgroundColor: t.preview, borderRadius: t.radiusSm, borderWidth: 1, borderColor: t.border, paddingVertical: 4 }}>
          <MessagePreview m={SAMPLE} />
        </View>
        <Segmented
          value={settings.previewDisplay}
          onChange={(v) => update({ previewDisplay: v })}
          options={[
            { value: 'cozy', label: 'Avec avatars', icon: 'person-circle-outline' },
            { value: 'compact', label: 'Compact', icon: 'list-outline' },
          ]}
        />
        <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>{tr("Forme des avatars")}</Text>
        <Segmented
          value={ms.avatarShape}
          onChange={(v) => setMs({ avatarShape: v })}
          options={[
            { value: 'circle', label: 'Rond', icon: 'ellipse-outline' },
            { value: 'rounded', label: 'Arrondi', icon: 'square-outline' },
            { value: 'square', label: 'Carré', icon: 'stop-outline' },
          ]}
        />
        <Slider label="Taille des avatars" value={ms.avatarSize} min={28} max={56} step={2} format={(v) => `${v} px`} onChange={(v) => setMs({ avatarSize: v })} />
        <Slider label="Taille du texte des messages" value={ms.fontSize} min={12} max={20} step={1} format={(v) => `${v} px`} onChange={(v) => setMs({ fontSize: v })} />
        <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>{tr("Espacement")}</Text>
        <Segmented
          value={ms.spacing}
          onChange={(v) => setMs({ spacing: v })}
          options={[
            { value: 'tight', label: 'Serré' },
            { value: 'normal', label: 'Normal' },
            { value: 'airy', label: 'Aéré' },
          ]}
        />
        <Slider label="Largeur max. des embeds" value={ms.embedMaxWidth} min={260} max={720} step={20} format={(v) => `${v} px`} onChange={(v) => setMs({ embedMaxWidth: v })} />
        <Slider label="Épaisseur de la barre d’embed" value={ms.embedBarWidth} min={2} max={8} step={1} format={(v) => `${v} px`} onChange={(v) => setMs({ embedBarWidth: v })} />
        <ToggleRow icon="chatbox-outline" label="Messages en bulles" value={ms.bubbles} onChange={(v) => setMs({ bubbles: v })} />
        <ToggleRow icon="albums-outline" label="Regrouper les messages consécutifs" value={ms.groupMessages} onChange={(v) => setMs({ groupMessages: v })} />
        <ToggleRow icon="time-outline" label="Afficher l’heure" value={ms.showTimestamps} onChange={(v) => setMs({ showTimestamps: v })} />
        <ToggleRow icon="pricetag-outline" label="Afficher le badge BOT" value={ms.showBotTag} onChange={(v) => setMs({ showBotTag: v })} />
        <Button variant="ghost" icon="refresh-outline" label="Valeurs par défaut" onPress={() => update({ messageStyle: DEFAULT_MESSAGE_STYLE, previewDisplay: 'cozy' })} />
      </Box>

      {/* ---------- Envoi ---------- */}
      <Box title="Envoi" icon="paper-plane-outline" defaultCollapsed>
        <ToggleRow icon="shield-checkmark-outline" label="Confirmer avant d’envoyer" value={settings.confirmBeforeSend} onChange={(v) => update({ confirmBeforeSend: v })} />
        <ToggleRow icon="contract-outline" label="Replier les messages envoyés" value={settings.autoCollapseSent} onChange={(v) => update({ autoCollapseSent: v })} />
        <ToggleRow icon="pulse-outline" label="Vibrations" value={settings.haptics} onChange={(v) => update({ haptics: v })} />
      </Box>

      {/* ---------- Comptes ---------- */}
      <Box title="Compte Fluxer" icon="person-circle-outline" collapsible={false}>
        <ListRow
          icon={session.hasUser ? 'person-circle' : 'person-circle-outline'}
          title={session.hasUser ? (session.user?.global_name || session.user?.username || 'Compte connecté') : 'Compte Fluxer'}
          subtitle={session.hasUser ? 'Voir mon profil' : 'Se connecter pour accéder à ses serveurs'}
          onPress={go(onOpenAccount)}
        />
      </Box>

      <DevicesSection />

      <Box title="Instance Fluxer" icon="globe-outline" defaultCollapsed>
        <Input
          value={instance}
          onChangeText={setInstance}
          label="Adresse de l’instance"
          hint="fluxer.app par défaut. Pour une instance auto-hébergée, mets son adresse : l’API est découverte via /.well-known/fluxer."
          autoCapitalize="none"
          keyboardType="url"
        />
        <Button icon="pulse-outline" label="Tester et enregistrer" loading={testing} onPress={testInstance} />
      </Box>

      {/* ---------- Transfert entre plateformes ---------- */}
      <DataTransfer
        title="Transférer vers une autre plateforme"
        icon="swap-horizontal-outline"
        intro="Exporte toutes tes données dans un fichier, puis importe-le dans FluxerHooks sur un autre appareil (Mobile ⇄ Desktop) : brouillon, historique, sauvegardes, modèles, automatisations et paramètres, avec tes comptes Fluxer si tu le souhaites."
        exportLabel="Exporter mes données"
        importLabel="Importer des données"
        accountsByDefault
        onRestored={() => {
          onClose();
          onRestored();
        }}
      />

      {/* ---------- Données ---------- */}
      <Box title="Données" icon="folder-open-outline" collapsible={false}>
        <ListRow icon="archive-outline" title="Sauvegardes, backups, modèles et automatisations" onPress={go(onOpenData)} />
        <ListRow icon="code-slash-outline" title="Importer / exporter en JSON" subtitle="Compatible Discohook" onPress={go(onOpenJson)} />
        <Stack row gap={8}>
          <Button
            flex
            variant="danger"
            icon="trash-outline"
            label="Vider le brouillon"
            onPress={() => Alert.alert('Vider le brouillon ?', 'Messages et webhooks seront effacés.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Vider', style: 'destructive', onPress: clearAll }])}
          />
          <Button
            flex
            icon="refresh-outline"
            label="Réinitialiser"
            onPress={() => Alert.alert('Réinitialiser l’apparence ?', 'Thème, zoom, fond, styles et apparence des messages reviennent par défaut.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Réinitialiser', onPress: reset }])}
          />
        </Stack>
      </Box>

      <Box title="À propos" icon="information-circle-outline" defaultCollapsed>
        <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>
          FluxerHooks-{APP_VERSION} — éditeur de messages webhook pour Fluxer. Projet indépendant, non affilié à Fluxer.
        </Text>
        <ListRow icon="book-outline" title="Documentation API Fluxer" onPress={() => Linking.openURL('https://docs.fluxer.app')} />
        <ListRow icon="logo-github" title="Fluxer sur GitHub" onPress={() => Linking.openURL('https://github.com/fluxerapp/fluxer')} />
      </Box>
    </Sheet>
  );
}
