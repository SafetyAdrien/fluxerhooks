import React, { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { PALETTES, ACCENTS } from '../theme/themes';
import { clearEndpointCache, resolveEndpoints } from '../api/fluxer';
import { hexToInt } from '../utils/parse';
import { Box, Button, Grid, Input, ListRow, Segmented, Sheet, Stack, ToggleRow, useToast } from '../components/ui';
import type { ThemeName } from '../types';

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
      <View style={{ height: 54, flexDirection: 'row' }}>
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
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={16} color={selected ? t.accent : t.textFaint} />
        <Text style={{ color: t.text, fontWeight: '600', fontSize: t.font(13) }}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function SettingsSheet({
  visible,
  onClose,
  onOpenBot,
  onOpenJson,
  onOpenBackups,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenBot: () => void;
  onOpenJson: () => void;
  onOpenBackups: () => void;
}) {
  const { theme: t, settings, update, reset, botToken, setBotToken } = useSettings();
  const { clearAll } = useEditor();
  const toast = useToast();
  const [instance, setInstance] = useState(settings.instance);
  const [accentHex, setAccentHex] = useState(settings.accent);
  const [testing, setTesting] = useState(false);

  const themes: { name: ThemeName; label: string }[] = [
    { name: 'dark', label: 'Sombre' },
    { name: 'light', label: 'Clair' },
    { name: 'amoled', label: 'AMOLED' },
    { name: 'fluxer', label: 'Indigo' },
    { name: 'midnight', label: 'Minuit' },
    { name: 'system', label: 'Système' },
  ];

  const testInstance = async () => {
    setTesting(true);
    const url = instance.trim().replace(/\/+$/, '') || 'https://fluxer.app';
    clearEndpointCache();
    const ep = await resolveEndpoints(url);
    setTesting(false);
    update({ instance: url });
    toast(`API : ${ep.api}`, 'success');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Paramètres" full>
      <Box title="Thème" icon="color-palette-outline" collapsible={false}>
        <Grid min={100} gap={8}>
          {themes.map((x) => (
            <ThemeCard key={x.name} name={x.name} label={x.label} selected={settings.theme === x.name} onPress={() => update({ theme: x.name })} />
          ))}
        </Grid>
        <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>Couleur d’accent</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ACCENTS.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                update({ accent: c });
                setAccentHex(c);
              }}
              accessibilityLabel={`Accent ${c}`}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: c,
                borderWidth: settings.accent.toLowerCase() === c.toLowerCase() ? 3 : 0,
                borderColor: t.text,
              }}
            />
          ))}
        </View>
        <Input
          value={accentHex}
          onChangeText={(v) => {
            setAccentHex(v);
            const n = hexToInt(v);
            if (n !== null) update({ accent: '#' + n.toString(16).padStart(6, '0').toUpperCase() });
          }}
          placeholder="#4641D9"
          autoCapitalize="characters"
          mono
        />
      </Box>

      <Box title="Interface" icon="phone-portrait-outline" collapsible={false}>
        <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>Taille du texte</Text>
        <Segmented
          value={String(settings.fontScale)}
          onChange={(v) => update({ fontScale: Number(v) })}
          options={[
            { value: '0.85', label: 'Petit' },
            { value: '1', label: 'Normal' },
            { value: '1.15', label: 'Grand' },
            { value: '1.3', label: 'Max' },
          ]}
        />
        <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>Arrondi des conteneurs</Text>
        <Segmented
          value={String(settings.radius)}
          onChange={(v) => update({ radius: Number(v) })}
          options={[
            { value: '4', label: 'Carré' },
            { value: '8', label: 'Doux' },
            { value: '12', label: 'Rond' },
            { value: '18', label: 'Bulle' },
          ]}
        />
        <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>Densité</Text>
        <Segmented
          value={settings.density}
          onChange={(v) => update({ density: v })}
          options={[
            { value: 'comfortable', label: 'Confortable', icon: 'resize-outline' },
            { value: 'compact', label: 'Compacte', icon: 'contract-outline' },
          ]}
        />
        <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>Affichage de l’aperçu</Text>
        <Segmented
          value={settings.previewDisplay}
          onChange={(v) => update({ previewDisplay: v })}
          options={[
            { value: 'cozy', label: 'Avec avatars' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
        <ToggleRow
          icon="tablet-landscape-outline"
          label="Écran partagé"
          description="Éditeur et aperçu côte à côte sur tablette et en paysage"
          value={settings.splitView === 'auto'}
          onChange={(v) => update({ splitView: v ? 'auto' : 'off' })}
        />
        <ToggleRow icon="calculator-outline" label="Compteurs de caractères" value={settings.showCounters} onChange={(v) => update({ showCounters: v })} />
      </Box>

      <Box title="Envoi" icon="paper-plane-outline" collapsible={false}>
        <ToggleRow icon="shield-checkmark-outline" label="Confirmer avant d’envoyer" value={settings.confirmBeforeSend} onChange={(v) => update({ confirmBeforeSend: v })} />
        <ToggleRow icon="contract-outline" label="Replier les messages envoyés" value={settings.autoCollapseSent} onChange={(v) => update({ autoCollapseSent: v })} />
        <ToggleRow icon="pulse-outline" label="Vibrations" value={settings.haptics} onChange={(v) => update({ haptics: v })} />
      </Box>

      <Box title="Compte bot" icon="hardware-chip-outline" collapsible={false}>
        <ListRow
          icon={botToken ? 'checkmark-circle' : 'ellipse-outline'}
          title={botToken ? 'Bot connecté' : 'Aucun bot'}
          subtitle={botToken ? 'Serveurs, salons, threads et tags de forum accessibles' : 'Optionnel : pour parcourir tes serveurs'}
          onPress={() => {
            onClose();
            onOpenBot();
          }}
        />
        {!!botToken && (
          <Button
            variant="ghost"
            icon="log-out-outline"
            label="Supprimer le token"
            onPress={() => Alert.alert('Supprimer le token du bot ?', undefined, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => setBotToken('') }])}
          />
        )}
      </Box>

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

      <Box title="Données" icon="folder-open-outline" collapsible={false}>
        <ListRow icon="archive-outline" title="Sauvegardes" subtitle="Enregistrer et recharger des brouillons" onPress={() => { onClose(); onOpenBackups(); }} />
        <ListRow icon="code-slash-outline" title="Importer / exporter en JSON" subtitle="Compatible Discohook" onPress={() => { onClose(); onOpenJson(); }} />
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
            onPress={() => Alert.alert('Réinitialiser les paramètres ?', undefined, [{ text: 'Annuler', style: 'cancel' }, { text: 'Réinitialiser', onPress: () => { reset(); setAccentHex('#4641D9'); setInstance('https://fluxer.app'); } }])}
          />
        </Stack>
      </Box>

      <Box title="À propos" icon="information-circle-outline" defaultCollapsed>
        <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>
          FluxerHooks-{Constants.expoConfig?.version ?? ''} — éditeur de messages webhook pour Fluxer. Projet indépendant, non affilié à Fluxer.
        </Text>
        <ListRow icon="book-outline" title="Documentation API Fluxer" onPress={() => Linking.openURL('https://docs.fluxer.app')} />
        <ListRow icon="logo-github" title="Fluxer sur GitHub" onPress={() => Linking.openURL('https://github.com/fluxerapp/fluxer')} />
      </Box>
    </Sheet>
  );
}
