import React, { useEffect, useRef } from 'react';
import { Switch, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useEditor } from '../state/editor';
import { useSettings } from '../state/settings';
import { useSender } from '../state/useSender';
import { useEndpoints } from '../state/useEndpoints';
import { avatarUrl, isForumType } from '../api/fluxer';
import { parseWebhookUrl } from '../utils/parse';
import { Avatar, Box, Button, IconBtn, Input, Stack } from './ui';
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
          <Stack row gap={0}>
            <IconBtn
              icon="clipboard-outline"
              label="Coller depuis le presse-papiers"
              size={18}
              onPress={async () => updateTarget(tg.id, { url: (await Clipboard.getStringAsync()).trim() })}
            />
            {canRemove && <IconBtn icon="close" label="Retirer ce webhook" size={18} onPress={() => removeTarget(tg.id)} />}
          </Stack>
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
    </Box>
  );
}
