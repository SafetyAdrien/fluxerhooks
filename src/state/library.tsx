import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Automation, DraftMessage, Template } from '../types';
import { AUTOMATIONS_KEY, RUNLOG_KEY, TEMPLATES_KEY, computeNextRun, runAutomation, runDueAutomations } from './automation';
import { builtinTemplates } from './templates';
import { setBackgroundAutomations } from './backgroundTask';
import { cloneMessage, uid } from '../utils/factory';

interface RunLog {
  at: string;
  name: string;
  result: string;
}

interface LibraryApi {
  templates: Template[];
  userTemplates: Template[];
  saveTemplate: (name: string, description: string, icon: string, messages: DraftMessage[]) => void;
  deleteTemplate: (id: string) => void;
  automations: Automation[];
  upsertAutomation: (a: Automation) => void;
  deleteAutomation: (id: string) => void;
  toggleAutomation: (id: string, enabled: boolean) => void;
  runNow: (id: string) => Promise<string>;
  log: RunLog[];
  reload: () => Promise<void>;
}

const LibraryContext = createContext<LibraryApi | null>(null);

export function LibraryProvider({ children, onAutoRun }: { children: React.ReactNode; onAutoRun?: (n: number) => void }) {
  const [userTemplates, setUserTemplates] = useState<Template[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [log, setLog] = useState<RunLog[]>([]);
  const running = useRef(false);
  const onAutoRunRef = useRef(onAutoRun);
  onAutoRunRef.current = onAutoRun;

  const reload = useCallback(async () => {
    try {
      const [t, a, l] = await Promise.all([
        AsyncStorage.getItem(TEMPLATES_KEY),
        AsyncStorage.getItem(AUTOMATIONS_KEY),
        AsyncStorage.getItem(RUNLOG_KEY),
      ]);
      setUserTemplates(t ? JSON.parse(t) : []);
      setAutomations(a ? JSON.parse(a) : []);
      setLog(l ? JSON.parse(l) : []);
    } catch {
      // données illisibles : on repart de zéro
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Rattrapage des envois programmés tant que l'app est ouverte (et à chaque retour au premier plan).
  const tick = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const n = await runDueAutomations();
      if (n) {
        await reload();
        onAutoRunRef.current?.(n);
      }
    } finally {
      running.current = false;
    }
  }, [reload]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, 30_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [tick]);

  useEffect(() => {
    setBackgroundAutomations(automations.some((a) => a.enabled));
  }, [automations]);

  const persistTemplates = (list: Template[]) => {
    setUserTemplates(list);
    AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(list)).catch(() => {});
  };
  const persistAutomations = (list: Automation[]) => {
    setAutomations(list);
    AsyncStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(list)).catch(() => {});
  };

  const value = useMemo<LibraryApi>(
    () => ({
      templates: [...userTemplates, ...builtinTemplates()],
      userTemplates,
      saveTemplate: (name, description, icon, messages) =>
        persistTemplates([
          { id: uid(), name: name.trim() || 'Mon modèle', description, icon, messages: messages.map((m) => ({ ...cloneMessage(m), attachments: [] })) },
          ...userTemplates,
        ]),
      deleteTemplate: (id) => persistTemplates(userTemplates.filter((x) => x.id !== id)),
      automations,
      upsertAutomation: (a) => {
        const next = { ...a, nextRun: a.enabled ? computeNextRun(a, new Date(Date.now() - 1000)) : a.nextRun };
        persistAutomations(automations.some((x) => x.id === a.id) ? automations.map((x) => (x.id === a.id ? next : x)) : [next, ...automations]);
      },
      deleteAutomation: (id) => persistAutomations(automations.filter((x) => x.id !== id)),
      toggleAutomation: (id, enabled) =>
        persistAutomations(automations.map((x) => (x.id === id ? { ...x, enabled, nextRun: enabled ? computeNextRun(x) : x.nextRun } : x))),
      runNow: async (id) => {
        const a = automations.find((x) => x.id === id);
        if (!a) return 'Introuvable';
        const result = await runAutomation(a);
        persistAutomations(automations.map((x) => (x.id === id ? { ...x, lastRun: new Date().toISOString(), lastResult: result, runs: x.runs + 1 } : x)));
        return result;
      },
      log,
      reload,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userTemplates, automations, log, reload],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const c = useContext(LibraryContext);
  if (!c) throw new Error('useLibrary hors LibraryProvider');
  return c;
}
