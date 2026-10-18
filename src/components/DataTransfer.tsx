import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { tr } from '../i18n';
import { useSettings } from '../state/settings';
import { readPickedText } from '../platform/files';
import { backupHasAccounts, exportFullBackup, importFullBackup } from '../utils/fullBackup';
import { WrongPasswordError } from '../utils/secretsTransfer';
import { Box, Button, Dialog, Input, ToggleRow, useToast, type IconName } from './ui';

/**
 * Export / import de toutes les données de l'app dans un fichier, pour passer d'un appareil
 * ou d'une plateforme à l'autre (Mobile ⇄ Desktop). Utilisé dans Données → Backup et dans
 * les Paramètres. Les comptes (tokens) peuvent être inclus, chiffrés par un mot de passe.
 */
export function DataTransfer({
  onRestored,
  title = 'Backup complet',
  icon = 'cloud-download-outline',
  intro = "Un seul fichier contenant le brouillon, toutes les sauvegardes, modèles, automatisations et paramètres (thème, zoom, styles…). Les tokens de compte et de bot ne sont inclus que si tu le demandes, chiffrés par un mot de passe.",
  exportLabel = 'Exporter un backup',
  importLabel = 'Restaurer un backup',
  accountsByDefault = false,
}: {
  onRestored: () => void;
  title?: string;
  icon?: IconName;
  intro?: string;
  exportLabel?: string;
  importLabel?: string;
  accountsByDefault?: boolean;
}) {
  const { theme: t } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [withAccounts, setWithAccounts] = useState(accountsByDefault);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  // Backup avec comptes chiffrés en attente du mot de passe.
  const [locked, setLocked] = useState<string | null>(null);
  const [unlock, setUnlock] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const pwdOk = password.length >= 6 && password === password2;

  const restore = async (text: string, pwd?: string) => {
    try {
      const r = await importFullBackup(text, pwd);
      toast(
        r.accounts ? tr('Backup restauré ({n} éléments, {a} compte(s)).', { n: r.items, a: r.accounts }) : tr('Backup restauré ({n} éléments).', { n: r.items }),
        'success',
      );
      setLocked(null);
      setUnlock('');
      setUnlockError('');
      onRestored();
    } catch (e) {
      const msg = e instanceof WrongPasswordError ? tr('Mot de passe incorrect.') : e instanceof Error ? tr(e.message) : tr('Backup invalide.');
      // La boîte de mot de passe reste ouverte : l'erreur s'affiche dedans (le toast serait caché derrière).
      if (pwd) setUnlockError(msg);
      else toast(msg, 'error');
    }
  };

  return (
    <>
      <Box title={title} icon={icon} collapsible={false}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>{tr(intro)}</Text>
        <ToggleRow
          label="Inclure mes comptes"
          description="Pour retrouver tes comptes Fluxer sur un autre appareil (ex. FluxerHooks pour Linux). Les tokens sont chiffrés avec ton mot de passe."
          value={withAccounts}
          onChange={setWithAccounts}
        />
        {withAccounts && (
          <>
            <Input label="Mot de passe du backup" value={password} onChangeText={setPassword} placeholder="6 caractères minimum" secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Input label="Confirmer le mot de passe" value={password2} onChangeText={setPassword2} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Text style={{ color: t.textMuted, fontSize: t.font(12), lineHeight: t.font(17) }}>
              {tr("Garde ce fichier pour toi : avec le mot de passe, il donne accès à tes comptes. Le mot de passe n’est enregistré nulle part.")}
            </Text>
          </>
        )}
        <Button
          variant="primary"
          icon="share-outline"
          label={exportLabel}
          loading={busy}
          disabled={withAccounts && !pwdOk}
          onPress={async () => {
            setBusy(true);
            try {
              const r = await exportFullBackup({ password: withAccounts ? password : undefined });
              if (r === 'saved') toast('Backup enregistré.', 'success');
              else if (r === 'unavailable') toast('Partage indisponible sur cet appareil.', 'error');
              if (r === 'saved' || r === 'shared') {
                setPassword('');
                setPassword2('');
              }
            } catch {
              toast('Échec de l’export.', 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button
          icon="download-outline"
          label={importLabel}
          onPress={async () => {
            try {
              const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
              if (res.canceled) return;
              const text = await readPickedText(res.assets[0]);
              if (backupHasAccounts(text)) {
                setLocked(text);
                return;
              }
              Alert.alert('Restaurer ce backup ?', 'Tes données actuelles seront remplacées.', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Restaurer', style: 'destructive', onPress: () => restore(text) },
              ]);
            } catch {
              toast('Impossible de lire ce fichier.', 'error');
            }
          }}
        />
      </Box>
      <Dialog visible={!!locked} onClose={() => { setLocked(null); setUnlock(''); setUnlockError(''); }} title="Restaurer ce backup ?" icon="key-outline">
        <Text style={{ color: t.textMuted, fontSize: t.font(14), lineHeight: t.font(20) }}>
          {tr("Ce backup contient des comptes chiffrés. Entre son mot de passe pour les retrouver ici. Tes données actuelles seront remplacées.")}
        </Text>
        <Input label="Mot de passe du backup" value={unlock} onChangeText={(v) => { setUnlock(v); setUnlockError(''); }} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        {!!unlockError && <Text style={{ color: t.danger, fontSize: t.font(13), fontWeight: '600' }}>{unlockError}</Text>}
        <Button
          variant="primary"
          icon="lock-open-outline"
          label="Restaurer avec mes comptes"
          disabled={!unlock}
          loading={unlocking}
          onPress={async () => {
            if (!locked) return;
            setUnlocking(true);
            await restore(locked, unlock);
            setUnlocking(false);
          }}
        />
        <Button
          icon="download-outline"
          label="Restaurer sans les comptes"
          onPress={() => {
            if (!locked) return;
            const text = locked;
            setLocked(null);
            restore(text);
          }}
        />
      </Dialog>
    </>
  );
}
