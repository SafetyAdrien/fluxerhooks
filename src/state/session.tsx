import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BOT_ENABLED } from '../config';
import { apiFor, logout as apiLogout, type Credential } from '../api/fluxer';
import { useSettings } from './settings';
import { useEndpoints } from './useEndpoints';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { ApiChannel, ApiEmoji, ApiGuild, ApiRole, FluxerUser } from '../types';

/** Compte enregistré pour le changement rapide (le token est à part, chiffré). */
export interface SavedAccount {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  lastUsed: number;
}
const ACCOUNTS_KEY = 'fluxerhooks:accounts:v1';
const tokenKey = (id: string) => `fluxerhooks_acct_${id}`;
async function readSecret(k: string) {
  try {
    return await SecureStore.getItemAsync(k);
  } catch {
    return null;
  }
}
async function writeSecret(k: string, v: string | null) {
  try {
    if (v) await SecureStore.setItemAsync(k, v);
    else await SecureStore.deleteItemAsync(k);
  } catch {
    // Keystore indisponible (web) : le compte reste utilisable pendant la session.
  }
}

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
  /** Comptes enregistrés (multi-comptes). */
  accounts: SavedAccount[];
  /** Passe sur un autre compte enregistré : instantané grâce au cache, puis rafraîchi en arrière-plan. */
  switchAccount: (id: string) => Promise<'ok' | 'reauth'>;
  /** Oublie un compte enregistré (sans le déconnecter côté serveur). */
  forgetAccount: (id: string) => Promise<void>;
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
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  // Cache par token : profil et serveurs, pour un changement de compte sans attente.
  const cache = useRef(new Map<string, { user?: FluxerUser; guilds?: ApiGuild[] }>());
  const tokens = useRef(new Map<string, string>());

  useEffect(() => {
    AsyncStorage.getItem(ACCOUNTS_KEY)
      .then((raw) => raw && setAccounts(JSON.parse(raw)))
      .catch(() => {});
  }, []);
  const saveAccounts = useCallback((list: SavedAccount[]) => {
    setAccounts(list);
    AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)).catch(() => {});
  }, []);

  const credential = useCallback(
    (source?: Source): Credential | null => {
      const s = source ?? (userToken ? 'user' : botToken ? 'bot' : null);
      if (s === 'user' && userToken) return { kind: 'user', token: userToken };
      if (s === 'bot' && botToken) return { kind: 'bot', token: botToken };
      return null;
    },
    [userToken, botToken],
  );

  /** Mémorise un compte avec SON token, uniquement après une réponse du serveur pour ce token. */
  const register = useCallback((me: FluxerUser, token: string) => {
    tokens.current.set(me.id, token);
    writeSecret(tokenKey(me.id), token);
    const entry: SavedAccount = { id: me.id, username: me.username, global_name: me.global_name, avatar: me.avatar ?? null, lastUsed: Date.now() };
    setAccounts((prev) => {
      const next = [entry, ...prev.filter((a) => a.id !== me.id)];
      AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const refreshMe = useCallback(async () => {
    if (userToken) {
      const hit = cache.current.get(userToken);
      if (hit?.user) setUser(hit.user);
      const me = await apiFor(ep, { kind: 'user', token: userToken }).me().catch(() => null);
      if (me) {
        cache.current.set(userToken, { ...cache.current.get(userToken), user: me });
        setUser(me);
        register(me, userToken);
      } else if (!hit?.user) setUser(null);
    } else setUser(null);
    if (botToken) setBotUser(await apiFor(ep, { kind: 'bot', token: botToken }).me().catch(() => null));
    else setBotUser(null);
  }, [ep, userToken, botToken, register]);

  useEffect(() => {
    refreshMe();
    setGuilds({ user: (userToken && cache.current.get(userToken)?.guilds) || [], bot: [] });
    setGuildData({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMe]);

  const switchAccount = useCallback(
    async (id: string) => {
      const token = tokens.current.get(id) ?? (await readSecret(tokenKey(id)));
      if (!token) return 'reauth';
      // Vérifie que ce token appartient bien à ce compte avant de basculer.
      let me: FluxerUser | null = null;
      let rejected = false;
      try {
        me = await apiFor(ep, { kind: 'user', token }).me();
      } catch (e: any) {
        // 401/403 : session expirée ou révoquée. Autre erreur (réseau) : on bascule quand même.
        rejected = e?.status === 401 || e?.status === 403;
      }
      const saved = accounts.find((a) => a.id === id);
      const fallback = cache.current.get(token)?.user ?? (saved ? ({ id: saved.id, username: saved.username, global_name: saved.global_name, avatar: saved.avatar } as FluxerUser) : null);
      if (rejected || (me && me.id !== id)) {
        // Session refusée, ou token enregistré sous le mauvais compte par une ancienne version : on l'oublie.
        tokens.current.delete(id);
        await writeSecret(tokenKey(id), null);
        return 'reauth';
      }
      const who = me ?? fallback;
      if (!who) return 'reauth';
      cache.current.set(token, { ...cache.current.get(token), user: who });
      // Le token d'abord, puis le profil : jamais de profil associé au mauvais token.
      await setUserToken(token);
      setUser(who);
      return 'ok';
    },
    [ep, accounts, setUserToken],
  );

  const forgetAccount = useCallback(
    async (id: string) => {
      tokens.current.delete(id);
      await writeSecret(tokenKey(id), null);
      saveAccounts(accounts.filter((a) => a.id !== id));
    },
    [accounts, saveAccounts],
  );

  const loadGuilds = useCallback(
    async (source: Source, force = false) => {
      const c = credential(source);
      if (!c) return [];
      if (!force && guilds[source].length) return guilds[source];
      const key = `g:${source}`;
      inflight.current[key] ??= apiFor(ep, c).guilds().finally(() => delete inflight.current[key]);
      const list: ApiGuild[] = await inflight.current[key];
      if (source === 'user' && userToken) cache.current.set(userToken, { ...cache.current.get(userToken), guilds: list });
      setGuilds((g) => ({ ...g, [source]: list }));
      return list;
    },
    [credential, ep, guilds, userToken],
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

  /** Déconnexion du compte actif ; on bascule sur le compte enregistré suivant s'il y en a un. */
  const signOut = useCallback(async () => {
    const current = user?.id;
    if (userToken) {
      cache.current.delete(userToken);
      await apiLogout(ep, userToken);
    }
    const rest = accounts.filter((a) => a.id !== current);
    if (current) {
      tokens.current.delete(current);
      await writeSecret(tokenKey(current), null);
      saveAccounts(rest);
    }
    const next = rest[0];
    const nextToken = next ? (tokens.current.get(next.id) ?? (await readSecret(tokenKey(next.id)))) : null;
    if (next && nextToken) {
      await setUserToken(nextToken);
      setUser(cache.current.get(nextToken)?.user ?? null);
    } else {
      await setUserToken('');
      setUser(null);
    }
  }, [ep, user, userToken, accounts, setUserToken, saveAccounts]);

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
      hasBot: BOT_ENABLED && !!botToken,
      user,
      botUser,
      credential,
      defaultSource: userToken ? 'user' : BOT_ENABLED && botToken ? 'bot' : null,
      guilds,
      loadGuilds,
      guildData,
      loadGuild,
      refreshMe,
      signOut,
      resolve,
      accounts,
      switchAccount,
      forgetAccount,
    }),
    [userToken, botToken, user, botUser, credential, guilds, loadGuilds, guildData, loadGuild, refreshMe, signOut, resolve, accounts, switchAccount, forgetAccount],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession hors SessionProvider');
  return c;
}
