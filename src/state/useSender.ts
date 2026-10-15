import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { bot, deleteWebhookMessage, fetchWebhookMessage, getWebhook, sendMessage, FluxerError } from '../api/fluxer';
import { useEditor } from './editor';
import { useSettings } from './settings';
import { getEndpoints } from './useEndpoints';
import { useToast } from '../components/ui';
import { parseWebhookUrl } from '../utils/parse';
import { messageFromApi } from '../utils/payload';
import type { DraftMessage, WebhookTarget } from '../types';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useSender() {
  const { state, updateMessage, updateTarget } = useEditor();
  const { settings, botToken, haptic } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null); // id du message en cours ou 'all'

  const activeTargets = useCallback(
    () => state.targets.filter((t) => t.enabled && parseWebhookUrl(t.url)),
    [state.targets],
  );

  /** Valide une cible et récupère nom/avatar/salon (et les tags de forum si un bot est configuré). */
  const validateTarget = useCallback(
    async (target: WebhookTarget) => {
      if (!parseWebhookUrl(target.url)) {
        updateTarget(target.id, { info: undefined, error: target.url.trim() ? 'URL de webhook invalide' : undefined });
        return;
      }
      try {
        const ep = await getEndpoints(settings.instance);
        const info = await getWebhook(ep, target.url);
        if (botToken) {
          try {
            const ch = await bot.channel(ep, botToken, info.channel_id);
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
    [settings.instance, botToken, updateTarget],
  );

  const doSend = useCallback(
    async (messages: DraftMessage[]) => {
      const targets = activeTargets();
      if (!targets.length) {
        toast('Ajoute au moins une URL de webhook valide.', 'error');
        haptic('error');
        return;
      }
      const ep = await getEndpoints(settings.instance);
      let ok = 0;
      let failed = 0;
      for (const m of messages) {
        for (const tg of targets) {
          try {
            const res = await sendMessage(ep, tg.url, m);
            ok++;
            updateMessage(m.id, {
              lastSent: { messageId: res.id, channelId: res.channel_id, at: new Date().toISOString() },
              ...(settings.autoCollapseSent ? { collapsed: true } : {}),
            });
          } catch (e) {
            failed++;
            const where = tg.info?.name ? ` (${tg.info.name})` : '';
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
    [activeTargets, settings.instance, settings.autoCollapseSent, updateMessage, toast, haptic],
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
      if (!tg) return toast('Ajoute d’abord l’URL du webhook qui a envoyé ce message.', 'error');
      setBusy(m.id);
      try {
        const ep = await getEndpoints(settings.instance);
        const raw = await fetchWebhookMessage(ep, tg.url, m.reference, m.threadMode === 'thread' ? m.thread_id : undefined);
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
    [activeTargets, settings.instance, updateMessage, toast],
  );

  const deleteRemote = useCallback(
    (m: DraftMessage, ref: string) => {
      const tg = activeTargets()[0];
      if (!tg) return toast('Aucun webhook valide.', 'error');
      Alert.alert('Supprimer le message sur Fluxer ?', 'Cette action est définitive.', [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setBusy(m.id);
            try {
              const ep = await getEndpoints(settings.instance);
              await deleteWebhookMessage(ep, tg.url, ref, m.threadMode === 'thread' ? m.thread_id : undefined);
              updateMessage(m.id, { lastSent: undefined, reference: m.reference === ref ? '' : m.reference });
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
    [activeTargets, settings.instance, updateMessage, toast],
  );

  return { busy, sendAll, sendOne, loadReference, deleteRemote, validateTarget, activeTargets };
}
