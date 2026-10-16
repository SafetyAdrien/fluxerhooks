import { useCallback } from 'react';
import { useEditor } from './editor';
import { useSession } from './session';
import { newTarget } from '../utils/factory';
import { botTargetUrl, parseBotTarget } from '../utils/parse';
import type { ApiChannel, ApiGuild, WebhookTarget } from '../types';

/**
 * Destinations « bot » : le bot publie lui-même dans un salon, un thread ou un forum,
 * sans avoir besoin de créer de webhook.
 */
export function useBotDestinations() {
  const { state, replace, updateTarget, removeTarget } = useEditor();
  const { botUser } = useSession();

  const list = state.targets.filter((t) => parseBotTarget(t.url));

  const add = useCallback(
    (channel: ApiChannel, guild?: ApiGuild): 'added' | 'exists' => {
      const url = botTargetUrl(channel.id);
      if (state.targets.some((t) => t.url === url)) return 'exists';
      const t: WebhookTarget = {
        ...newTarget(url),
        info: {
          id: botUser?.id ?? '',
          token: '',
          bot: true,
          name: botUser?.username ?? 'Bot',
          avatar: botUser?.avatar ?? null,
          channel_id: channel.id,
          guild_id: guild?.id ?? channel.guild_id ?? '',
          guildName: guild?.name,
          channelName: channel.name,
          channelType: channel.type,
          availableTags: channel.available_tags,
        },
      };
      replace({ targets: [...state.targets, t], messages: state.messages });
      return 'added';
    },
    [state.targets, state.messages, replace, botUser],
  );

  return { list, add, update: updateTarget, remove: removeTarget };
}
