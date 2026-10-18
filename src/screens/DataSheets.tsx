import { tr } from '../i18n';
import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { readPickedText, shareTextFile } from '../platform/files';
import { useEditor } from '../state/editor';
import { useSettings } from '../state/settings';
import { exportState, importState } from '../utils/payload';
import { Box, Button, EmptyState, IconBtn, Input, ListRow, Segmented, Sheet, Stack, ToggleRow, useToast } from '../components/ui';

export function JsonSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme: t } = useSettings();
  const { state, replace } = useEditor();
  const toast = useToast();
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [withTargets, setWithTargets] = useState(false);
  const [text, setText] = useState('');
  const json = exportState(state, withTargets);

  const doImport = (src: string) => {
    try {
      replace(importState(src, state));
      toast('Import réussi.', 'success');
      setText('');
      onClose();
    } catch (e) {
      toast(`JSON invalide : ${e instanceof Error ? e.message : e}`, 'error');
    }
  };

  const share = async () => {
    try {
      const r = await shareTextFile(`fluxerhooks-${Date.now()}.json`, json, 'Exporter le JSON');
      if (r === 'unavailable') toast('Partage indisponible sur cet appareil.', 'error');
      else if (r === 'saved') toast('Fichier enregistré.', 'success');
    } catch {
      toast('Échec de l’export.', 'error');
    }
  };

  const fromFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/*', '*/*'], copyToCacheDirectory: true });
      if (res.canceled) return;
      doImport(await readPickedText(res.assets[0]));
    } catch {
      toast('Impossible de lire ce fichier.', 'error');
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="JSON" full>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'export', label: 'Exporter', icon: 'share-outline' },
          { value: 'import', label: 'Importer', icon: 'download-outline' },
        ]}
      />
      {tab === 'export' ? (
        <>
          <ToggleRow
            label="Inclure les URL de webhook"
            description="Attention : une URL de webhook permet à n’importe qui de poster."
            value={withTargets}
            onChange={setWithTargets}
          />
          <Input value={json} multiline mono editable={false} style={{ minHeight: 260, fontSize: 12 }} />
          <Stack row gap={8}>
            <Button flex icon="copy-outline" label="Copier" onPress={async () => { await Clipboard.setStringAsync(json); toast('JSON copié.', 'success'); }} />
            <Button flex icon="share-social-outline" label="Partager" onPress={share} />
          </Stack>
        </>
      ) : (
        <>
          <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>
            {tr("Formats acceptés : export FluxerHooks, export Discohook, payload webhook brut (")}{'{'} content, embeds {'}'}) ou tableau de payloads. L’import remplace le brouillon actuel.
          </Text>
          <Input value={text} onChangeText={setText} multiline mono placeholder='{ "content": "Bonjour", "embeds": [ … ] }' style={{ minHeight: 220, fontSize: 12 }} />
          <Button variant="primary" icon="checkmark" label="Importer" disabled={!text.trim()} onPress={() => doImport(text)} />
          <Stack row gap={8}>
            <Button flex icon="clipboard-outline" label="Depuis le presse-papiers" onPress={async () => doImport(await Clipboard.getStringAsync())} />
            <Button flex icon="document-outline" label="Depuis un fichier" onPress={fromFile} />
          </Stack>
        </>
      )}
    </Sheet>
  );
}

export function BackupsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme: t } = useSettings();
  const { backups, saveBackup, deleteBackup, replace } = useEditor();
  const toast = useToast();
  const [name, setName] = useState('');

  return (
    <Sheet visible={visible} onClose={onClose} title="Sauvegardes" full>
      <Box title="Nouvelle sauvegarde" icon="save-outline" collapsible={false}>
        <Input value={name} onChangeText={setName} placeholder="Nom (ex : Règlement du serveur)" max={60} />
        <Button
          variant="primary"
          icon="save"
          label="Sauvegarder le brouillon"
          onPress={() => {
            saveBackup(name);
            setName('');
            toast('Brouillon sauvegardé.', 'success');
          }}
        />
      </Box>
      {!backups.length ? (
        <EmptyState icon="archive-outline" title="Aucune sauvegarde" text="Sauvegarde tes messages pour les retrouver plus tard (règles, annonces, rôles…)." />
      ) : (
        <View style={{ gap: 4 }}>
          {backups.map((b) => (
            <ListRow
              key={b.id}
              icon="document-text-outline"
              title={b.name}
              subtitle={`${new Date(b.createdAt).toLocaleString('fr-FR')} · ${b.state.messages.length} message(s)`}
              onPress={() =>
                Alert.alert(`Charger « ${b.name} » ?`, 'Le brouillon actuel sera remplacé.', [
                  { text: 'Annuler', style: 'cancel' },
                  {
                    text: 'Charger',
                    onPress: () => {
                      replace(JSON.parse(JSON.stringify(b.state)));
                      toast('Sauvegarde chargée.', 'success');
                      onClose();
                    },
                  },
                ])
              }
              right={
                <IconBtn
                  icon="trash-outline"
                  label="Supprimer la sauvegarde"
                  color={t.danger}
                  onPress={() =>
                    Alert.alert('Supprimer cette sauvegarde ?', undefined, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: () => deleteBackup(b.id) },
                    ])
                  }
                />
              }
            />
          ))}
        </View>
      )}
    </Sheet>
  );
}
