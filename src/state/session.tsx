import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFor, logout as apiLogout, type Credential } from '../api/fluxer';
import { useSettings } from './settings';
import { useEndpoints } from './useEndpoints';
import type { ApiChannel, ApiEmoji, ApiGuild, ApiRole, FluxerUser } from '../types';

/**
 * Session Fluxer : compte utilisateur et/ou bot.
 * Met en cache serveurs, salons, threads, rôles et émojis pour les menus déroulants,
 * le compositeur de mentions et l'aperçu (affichage des noms de #salon / @rôle).
 */

export type Source = 'user' | 'bot';

interface GuildData {
  channels: ApiChannel[];
  threads: ApiChannel[];
  roles: ApiRole[];
  emojis: ApiEmoji[];
  loadedAt: number;
}

interface SessionApi {
  hasUser: boolean;
  hasBot: boolean;
  user: FluxerUser | null;
  botUser: FluxerUser | null;
  credential: (source?: Source) => Credential | null;
  defaultSource: Source | null;
  guilds: Record<Source, ApiGuild[]>;
  loadGuilds: (source: Source, force?: boolean) => Promise<ApiGuild[]>;
  guildData: Record<string, GuildData>;
  loadGuild: (source: Source, guildId: string, force?: boolean) => Promise<GuildData>;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Nom lisible d'une mention, si connu en cache. */
  resolve: (kind: 'channel' | 'role' | 'user' | 'emoji', id: string) => string | undefined;
}

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { userToken, botToken, setUserToken } = useSettings();
  const ep = useEndpoints();
  const [user, setUser] = useState<FluxerUser | null>(null);
  const [botUser, setBotUser] = useState<FluxerUser | null>(null);
  const [guilds, setGuilds] = useState<Record<Source, ApiGuild[]>>({ user: [], bot: [] });
  const [guildData, setGuildData] = useState<Record<string, GuildData>>({});
  const inflight = useRef<Record<string, Promise<any>>>({});

  const credential = useCallback(
    (source?: Source): Credential | null => {
      const s = source ?? (userToken ? 'user' : botToken ? 'bot' : null);
      if (s === 'user' && userToken) return { kind: 'user', token: userToken };
      if (s === 'bot' && botToken) return { kind: 'bot', token: botToken };
      return null;
    },
    [userToken, botToken],
  );

  const refreshMe = useCallback(async () => {
    if (userToken) setUser(await apiFor(ep, { kind: 'user', token: userToken }).me().catch(() => null));
    else setUser(null);
    if (botToken) setBotUser(await apiFor(ep, { kind: 'bot', token: botToken }).me().catch(() => null));
    else setBotUser(null);
  }, [ep, userToken, botToken]);

  useEffect(() => {
    refreshMe();
    setGuilds({ user: [], bot: [] });
    setGuildData({});
  }, [refreshMe]);

  const loadGuilds = useCallback(
    async (source: Source, force = false) => {
      const c = credential(source);
      if (!c) return [];
      if (!force && guilds[source].length) return guilds[source];
      const key = `g:${source}`;
      inflight.current[key] ??= apiFor(ep, c).guilds().finally(() => delete inflight.current[key]);
      const list: ApiGuild[] = await inflight.current[key];
      setGuilds((g) => ({ ...g, [source]: list }));
      return list;
    },
    [credential, ep, guilds],
  );

  const loadGuild = useCallback(
    async (source: Source, guildId: string, force = false) => {
      const cached = guildData[guildId];
      if (cached && !force && Date.now() - cached.loadedAt < 5 * 60_000) return cached;
      const c = credential(source);
      if (!c) throw new Error('Aucun compte ni bot connecté.');
      const key = `d:${guildId}`;
      inflight.current[key] ??= (async () => {
        const api = apiFor(ep, c);
        const channels = await api.channels(guildId);
        const [threads, roles, emojis] = await Promise.all([
          api.activeThreads(guildId, channels).catch(() => []),
          api.roles(guildId).catch(() => [] as ApiRole[]),
          api.emojis(guildId).catch(() => [] as ApiEmoji[]),
        ]);
        const data: GuildData = { channels, threads, roles, emojis, loadedAt: Date.now() };
        setGuildData((d) => ({ ...d, [guildId]: data }));
        return data;
      })().finally(() => delete inflight.current[key]);
      return inflight.current[key];
    },
    [credential, ep, guildData],
  );

  const signOut = useCallback(async () => {
    if (userToken) await apiLogout(ep, userToken);
    await setUserToken('');
    setUser(null);
  }, [ep, userToken, setUserToken]);

  const resolve = useCallback(
    (kind: 'channel' | 'role' | 'user' | 'emoji', id: string) => {
      for (const g of Object.values(guildData)) {
        if (kind === 'channel') {
          const c = g.channels.find((x) => x.id === id) ?? g.threads.find((x) => x.id === id);
          if (c?.name) return c.name;
        } else if (kind === 'role') {
          const r = g.roles.find((x) => x.id === id);
          if (r) return r.name;
        } else if (kind === 'emoji') {
          const e = g.emojis.find((x) => x.id === id);
          if (e) return e.name;
        }
      }
      if (kind === 'user') {
        if (user?.id === id) return user.global_name || user.username;
        if (botUser?.id === id) return botUser.username;
      }
      return undefined;
    },
    [guildData, user, botUser],
  );

  const value = useMemo<SessionApi>(
    () => ({
      hasUser: !!userToken,
      hasBot: !!botToken,
      user,
      botUser,
      credential,
      defaultSource: userToken ? 'user' : botToken ? 'bot' : null,
      guilds,
      loadGuilds,
      guildData,
      loadGuild,
      refreshMe,
      signOut,
      resolve,
    }),
    [userToken, botToken, user, botUser, credential, guilds, loadGuilds, guildData, loadGuild, refreshMe, signOut, resolve],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession hors SessionProvider');
  return c;
}
