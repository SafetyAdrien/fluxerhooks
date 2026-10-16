import React, { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useEditor } from '../state/editor';
import { useSettings } from '../state/settings';
import { useSender } from '../state/useSender';
import { useEndpoints } from '../state/useEndpoints';
import { apiFor, avatarUrl, isForumType } from '../api/fluxer';
import { useSession } from '../state/session';
import { parseWebhookUrl } from '../utils/parse';
import { Avatar, Box, Button, FieldButton, FieldButtons, IconBtn, Input, Stack, useToast } from './ui';
import type { WebhookTarget } from '../types';

function TargetRow({ tg, canRemove }: { tg: WebhookTarget; canRemove: boolean }) {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const { updateTarget, removeTarget } = useEditor();
  const { validateTarget } = useSender();
  const last = useRef('');

  // Validation automatique quand une URL complète est saisie ou collée.
  useEffect(() => {
    if (tg.url === last.current) return;
    if (!tg.url.trim()) {
      last.current = tg.url;
      if (tg.info || tg.error) updateTarget(tg.id, { info: undefined, error: undefined });
      return;
    }
    if (!parseWebhookUrl(tg.url)) return;
    last.current = tg.url;
    const h = setTimeout(() => validateTarget(tg), 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tg.url]);

  const info = tg.info;
  return (
    <View style={{ gap: 8, opacity: tg.enabled ? 1 : 0.55 }}>
      <Input
        value={tg.url}
        onChangeText={(v) => updateTarget(tg.id, { url: v.trim() })}
        onBlur={() => tg.url.trim() && !parseWebhookUrl(tg.url) && updateTarget(tg.id, { error: 'URL de webhook invalide' })}
        placeholder="https://api.fluxer.app/webhooks/…/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        secureTextEntry={false}
        error={tg.error}
        right={
          <FieldButtons>
            <FieldButton mci="content-paste" label="Coller depuis le presse-papiers" onPress={async () => updateTarget(tg.id, { url: (await Clipboard.getStringAsync()).trim() })} />
            {canRemove && <FieldButton icon="close" label="Retirer ce webhook" onPress={() => removeTarget(tg.id)} />}
          </FieldButtons>
        }
      />
      {info && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface2, borderRadius: t.radiusSm, padding: 10 }}>
          <Avatar uri={avatarUrl(ep, info.id, info.avatar)} name={info.name} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: t.font(14) }}>{info.name}</Text>
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>
              {info.channelName ? `${isForumType(info.channelType ?? 0) ? 'Forum' : '#'} ${info.channelName}` : `Salon ${info.channel_id}`}
            </Text>
          </View>
          <Switch
            value={tg.enabled}
            onValueChange={(v) => updateTarget(tg.id, { enabled: v })}
            trackColor={{ false: t.border, true: t.accentSoft }}
            thumbColor={tg.enabled ? t.accent : t.textFaint}
            accessibilityLabel="Activer ce webhook"
          />
          <IconBtn icon="refresh" label="Revérifier" size={18} onPress={() => validateTarget(tg)} />
        </View>
      )}
    </View>
  );
}

/** Token du bot Fluxer, juste sous les webhooks : vérifié avant d'être enregistré (chiffré). */
function BotTokenRow({ onBrowse }: { onBrowse: () => void }) {
  const { theme: t, botToken, setBotToken, haptic } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { botUser } = useSession();
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    const tok = draft.trim().replace(/^Bot\s+/i, '');
    if (!tok) return;
    setBusy(true);
    setError(null);
    try {
      const me = await apiFor(ep, { kind: 'bot', token: tok }).me();
      await setBotToken(tok);
      setDraft('');
      haptic('success');
      toast(`Bot « ${me.username} » connecté.`, 'success');
    } catch (e) {
      haptic('error');
      setError(e instanceof Error ? e.message : 'Token invalide.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      nested
      title="Bot Fluxer"
      icon="hardware-chip-outline"
      subtitle={botToken ? (botUser ? `Connecté : ${botUser.username}` : 'Token enregistré') : 'Optionnel : salons, threads et tags'}
      defaultCollapsed={!!botToken}
    >
      {botToken ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar uri={botUser ? avatarUrl(ep, botUser.id, botUser.avatar) : null} name={botUser?.username ?? 'Bot'} size={t.z(36)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: t.font(14) }}>{botUser?.username ?? 'Bot connecté'}</Text>
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>Token chiffré sur ce téléphone</Text>
          </View>
          <FieldButtons>
            <FieldButton icon="albums-outline" label="Parcourir les serveurs du bot" onPress={onBrowse} />
            <FieldButton icon="log-out-outline" label="Retirer le token" color={t.danger} onPress={() => setBotToken('')} />
          </FieldButtons>
        </View>
      ) : (
        <>
          <Input
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setError(null);
            }}
            placeholder="Token du bot (ID_application.secret)"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            mono
            error={error}
            hint="Envoyé uniquement à l’API Fluxer, stocké chiffré (Android Keystore)."
            right={
              <FieldButtons>
                <FieldButton mci={show ? 'eye-off-outline' : 'eye-outline'} label={show ? 'Masquer le token' : 'Afficher le token'} onPress={() => setShow((v) => !v)} />
                <FieldButton mci="content-paste" label="Coller le token" onPress={async () => setDraft((await Clipboard.getStringAsync()).trim())} />
              </FieldButtons>
            }
          />
          <Button small variant="primary" icon="log-in-outline" label="Connecter le bot" loading={busy} disabled={!draft.trim()} onPress={connect} />
        </>
      )}
    </Box>
  );
}

export function TargetsEditor({ onBrowse }: { onBrowse: () => void }) {
  const { state, addTarget } = useEditor();
  const { botToken, userToken } = useSettings();
  const valid = state.targets.filter((x) => x.info).length;
  return (
    <Box
      title="Webhooks"
      icon="link"
      subtitle={valid ? `${valid} webhook(s) vérifié(s)` : 'Colle l’URL d’un webhook Fluxer'}
      badge={state.targets.length > 1 ? String(state.targets.length) : undefined}
    >
      {state.targets.map((tg) => (
        <TargetRow key={tg.id} tg={tg} canRemove={state.targets.length > 1 || !!tg.url} />
      ))}
      <Stack row wrap gap={8}>
        <Button small icon="add" label="Autre webhook" onPress={() => addTarget()} />
        <Button small icon="server-outline" label={botToken || userToken ? 'Parcourir mes serveurs' : 'Choisir sur mon serveur'} onPress={onBrowse} />
      </Stack>
      <BotTokenRow onBrowse={onBrowse} />
    </Box>
  );
}
