import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { apiFor, deleteTargetMessage, fetchTargetMessage, getWebhook, sendToTarget, FluxerError } from '../api/fluxer';
import { useEditor } from './editor';
import { useSettings } from './settings';
import { getEndpoints } from './useEndpoints';
import { useToast } from '../components/ui';
import { parseBotTarget, parseWebhookUrl } from '../utils/parse';
import { messageFromApi } from '../utils/payload';
import type { DraftMessage, WebhookTarget } from '../types';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useSender() {
  const { state, updateMessage, updateTarget } = useEditor();
  const { settings, botToken, userToken, haptic } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null); // id du message en cours ou 'all'

  const activeTargets = useCallback(
    () => state.targets.filter((t) => t.enabled && (parseWebhookUrl(t.url) || (botToken && parseBotTarget(t.url)))),
    [state.targets, botToken],
  );

  /** Valide une cible et récupère nom/avatar/salon (et les tags de forum si un bot est configuré). */
  const validateTarget = useCallback(
    async (target: WebhookTarget) => {
      const bot = parseBotTarget(target.url);
      if (bot) {
        // Salon du bot : on rafraîchit nom, type et tags du salon avec le token du bot.
        if (!botToken) return updateTarget(target.id, { error: 'Token du bot manquant.' });
        try {
          const ep = await getEndpoints(settings.instance);
          const api = apiFor(ep, { kind: 'bot', token: botToken });
          const [me, ch] = await Promise.all([api.me(), api.channel(bot.channelId)]);
          updateTarget(target.id, {
            error: undefined,
            info: {
              ...(target.info ?? { token: '', guild_id: '' }),
              id: me.id,
              token: '',
              bot: true,
              name: me.username,
              avatar: me.avatar ?? null,
              channel_id: ch.id,
              guild_id: ch.guild_id ?? target.info?.guild_id ?? '',
              channelName: ch.name,
              channelType: ch.type,
              availableTags: ch.available_tags,
            },
          });
        } catch (e) {
          updateTarget(target.id, { error: errText(e) });
        }
        return;
      }
      if (!parseWebhookUrl(target.url)) {
        updateTarget(target.id, { info: undefined, error: target.url.trim() ? 'URL de webhook invalide' : undefined });
        return;
      }
      try {
        const ep = await getEndpoints(settings.instance);
        const info = await getWebhook(ep, target.url);
        const cred = userToken ? ({ kind: 'user', token: userToken } as const) : botToken ? ({ kind: 'bot', token: botToken } as const) : null;
        if (cred) {
          try {
            const ch = await apiFor(ep, cred).channel(info.channel_id);
            info.channelName = ch.name;
            info.channelType = ch.type;
            info.availableTags = ch.available_tags;
          } catch {
            // le bot n'a pas accès à ce serveur : on garde les infos du webhook seules
          }
        }
        updateTarget(target.id, { info, error: undefined });
      } catch (e) {
        updateTarget(target.id, { info: undefined, error: errText(e) });
      }
    },
    [settings.instance, botToken, userToken, updateTarget],
  );

  const doSend = useCallback(
    async (messages: DraftMessage[]) => {
      const targets = activeTargets();
      if (!targets.length) {
        toast('Ajoute un webhook ou un salon pour le bot.', 'error');
        haptic('error');
        return;
      }
      const ep = await getEndpoints(settings.instance);
      let ok = 0;
      let failed = 0;
      for (const m of messages) {
        for (const tg of targets) {
          try {
            const res = await sendToTarget(ep, tg.url, m, botToken, tg.info?.channelType);
            ok++;
            updateMessage(m.id, {
              lastSent: { messageId: res.id, channelId: res.channel_id, at: new Date().toISOString() },
              flash: { kind: res.edited ? 'edited' : 'sent', at: Date.now() },
              ...(settings.autoCollapseSent ? { collapsed: true } : {}),
            });
          } catch (e) {
            failed++;
            const where = tg.info?.bot ? ` (bot · #${tg.info.channelName ?? tg.info.channel_id})` : tg.info?.name ? ` (${tg.info.name})` : '';
            toast(`Échec${where} : ${errText(e)}`, 'error');
            if (e instanceof FluxerError && e.status === 0) break;
          }
        }
      }
      if (ok && !failed) {
        haptic('success');
        toast(ok === 1 ? 'Message envoyé ✔' : `${ok} messages envoyés ✔`, 'success');
      } else if (failed) haptic('error');
    },
    [activeTargets, settings.instance, settings.autoCollapseSent, botToken, updateMessage, toast, haptic],
  );

  const confirmThen = (label: string, fn: () => void) => {
    if (!settings.confirmBeforeSend) return fn();
    Alert.alert('Confirmer', label, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Envoyer', onPress: fn },
    ]);
  };

  const sendAll = useCallback(() => {
    const n = state.messages.length * activeTargets().length;
    confirmThen(`Envoyer ${state.messages.length} message(s) vers ${activeTargets().length} webhook(s) ?`, async () => {
      setBusy('all');
      try {
        await doSend(state.messages);
      } finally {
        setBusy(null);
      }
    });
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages, doSend, activeTargets, settings.confirmBeforeSend]);

  const sendOne = useCallback(
    (m: DraftMessage) =>
      confirmThen(m.reference.trim() ? 'Modifier le message existant ?' : 'Envoyer ce message ?', async () => {
        setBusy(m.id);
        try {
          await doSend([m]);
        } finally {
          setBusy(null);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doSend, settings.confirmBeforeSend],
  );

  /** Charge un message déjà envoyé par le webhook dans l'éditeur (pour le modifier). */
  const loadReference = useCallback(
    async (m: DraftMessage) => {
      const tg = activeTargets()[0];
      if (!tg) return toast('Ajoute d’abord le webhook (ou le salon du bot) qui a envoyé ce message.', 'error');
      setBusy(m.id);
      try {
        const ep = await getEndpoints(settings.instance);
        const raw = await fetchTargetMessage(ep, tg.url, m, botToken);
        const loaded = messageFromApi(raw);
        updateMessage(m.id, {
          content: loaded.content,
          embeds: loaded.embeds,
          suppressEmbeds: loaded.suppressEmbeds,
          suppressNotifications: loaded.suppressNotifications,
        });
        toast('Message chargé : modifie-le puis appuie sur « Mettre à jour ».', 'success');
      } catch (e) {
        toast(errText(e), 'error');
      } finally {
        setBusy(null);
      }
    },
    [activeTargets, settings.instance, botToken, updateMessage, toast],
  );

  const deleteRemote = useCallback(
    (m: DraftMessage, ref: string) => {
      const tg = activeTargets()[0];
      if (!tg) return toast('Aucune destination valide.', 'error');
      Alert.alert('Supprimer le message sur Fluxer ?', 'Cette action est définitive.', [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setBusy(m.id);
            try {
              const ep = await getEndpoints(settings.instance);
              await deleteTargetMessage(ep, tg.url, m, ref, botToken);
              updateMessage(m.id, { lastSent: undefined, reference: m.reference === ref ? '' : m.reference, flash: { kind: 'deleted', at: Date.now() } });
              toast('Message supprimé.', 'success');
            } catch (e) {
              toast(errText(e), 'error');
            } finally {
              setBusy(null);
            }
          },
        },
      ]);
    },
    [activeTargets, settings.instance, botToken, updateMessage, toast],
  );

  return { busy, sendAll, sendOne, loadReference, deleteRemote, validateTarget, activeTargets };
}
