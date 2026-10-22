import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onExternalChange } from '../link/storageHook';
import { deviceId } from '../link/engine';
import { BOT_SYSTEMS_KEY } from './botEngine';
import type { BotSystem } from '../types';

/**
 * Systèmes du bot (rôles par réaction, bienvenue, départ) : liste enregistrée et synchronisée
 * entre appareils liés, plus un petit journal d'activité propre à cet appareil.
 */

export interface BotActivity {
  at: number;
  system: string;
  ok: boolean;
  text: string;
}

interface Ctx {
  systems: BotSystem[];
  device: string;
  upsert: (s: BotSystem) => void;
  remove: (id: string) => void;
  activity: BotActivity[];
  log: (a: Omit<BotActivity, 'at'>) => void;
}

const BotSystemsContext = createContext<Ctx | null>(null);

export function BotSystemsProvider({ children }: { children: React.ReactNode }) {
  const [systems, setSystems] = useState<BotSystem[]>([]);
  const [device, setDevice] = useState('');
  const [activity, setActivity] = useState<BotActivity[]>([]);
  const ref = useRef<BotSystem[]>([]);
  ref.current = systems;

  const reload = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(BOT_SYSTEMS_KEY);
      const list = raw ? (JSON.parse(raw) as BotSystem[]) : [];
      ref.current = Array.isArray(list) ? list : [];
      setSystems(ref.current);
    } catch {
      // données illisibles : liste vide
    }
  }, []);
  useEffect(() => {
    reload();
    deviceId().then(setDevice).catch(() => {});
  }, [reload]);
  // Modifiés sur un appareil lié : relus tout de suite.
  useEffect(() => onExternalChange((keys) => keys.includes(BOT_SYSTEMS_KEY) && reload()), [reload]);

  const persist = (next: BotSystem[]) => {
    ref.current = next;
    setSystems(next);
    AsyncStorage.setItem(BOT_SYSTEMS_KEY, JSON.stringify(next)).catch(() => {});
  };

  const value = useMemo<Ctx>(
    () => ({
      systems,
      device,
      upsert: (s) => {
        const now = new Date().toISOString();
        const list = ref.current;
        const i = list.findIndex((x) => x.id === s.id);
        persist(i < 0 ? [...list, { ...s, updatedAt: now }] : list.map((x) => (x.id === s.id ? { ...s, updatedAt: now } : x)));
      },
      remove: (id) => persist(ref.current.filter((x) => x.id !== id)),
      activity,
      log: (a) => setActivity((l) => [{ ...a, at: Date.now() }, ...l].slice(0, 60)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [systems, device, activity],
  );
  return <BotSystemsContext.Provider value={value}>{children}</BotSystemsContext.Provider>;
}

export function useBotSystems() {
  const c = useContext(BotSystemsContext);
  if (!c) throw new Error('useBotSystems hors du BotSystemsProvider');
  return c;
}
