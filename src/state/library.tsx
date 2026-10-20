import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onExternalChange } from '../link/storageHook';
import type { Automation, DraftMessage, Folder, Template } from '../types';
import { AUTOMATIONS_KEY, RUNLOG_KEY, TEMPLATES_KEY, computeNextRun, runAutomation, runDueAutomations } from './automation';
import { builtinTemplates } from './templates';
import { setBackgroundAutomations } from './backgroundTask';
import { cloneMessage, uid } from '../utils/factory';

interface RunLog {
  at: string;
  name: string;
  result: string;
}

export const FOLDERS_KEY = 'fluxerhooks:folders:v1';
export const FOLDER_COLORS = ['#5865F2', '#3BA55C', '#FAA61A', '#ED4245', '#EB459E', '#9B59B6', '#1ABC9C', '#95A5A6'];

interface LibraryApi {
  templates: Template[];
  userTemplates: Template[];
  /** Crée un modèle ; renvoie son id. */
  saveTemplate: (name: string, description: string, icon: string, messages: DraftMessage[], extra?: Partial<Template>) => string;
  deleteTemplate: (id: string) => void;
  updateTemplates: (ids: string[], patch: (t: Template) => Partial<Template>) => void;
  deleteTemplates: (ids: string[]) => void;
  addTemplates: (list: Template[]) => void;
  folders: Folder[];
  createFolder: (name: string, color?: string) => string;
  updateFolder: (id: string, patch: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;
  addFolders: (list: Folder[]) => void;
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
  const [folders, setFolders] = useState<Folder[]>([]);
  const tplRef = useRef<Template[]>([]);
  tplRef.current = userTemplates;
  const foldersRef = useRef<Folder[]>([]);
  foldersRef.current = folders;
  const [log, setLog] = useState<RunLog[]>([]);
  const running = useRef(false);
  const onAutoRunRef = useRef(onAutoRun);
  onAutoRunRef.current = onAutoRun;

  const reload = useCallback(async () => {
    try {
      const [t, a, l, f] = await Promise.all([
        AsyncStorage.getItem(TEMPLATES_KEY),
        AsyncStorage.getItem(AUTOMATIONS_KEY),
        AsyncStorage.getItem(RUNLOG_KEY),
        AsyncStorage.getItem(FOLDERS_KEY),
      ]);
      setUserTemplates(t ? JSON.parse(t) : []);
      setFolders(f ? JSON.parse(f) : []);
      setAutomations(a ? JSON.parse(a) : []);
      setLog(l ? JSON.parse(l) : []);
    } catch {
      // données illisibles : on repart de zéro
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Modèles, automatisations ou journal modifiés sur un appareil lié : relus tout de suite.
  useEffect(
    () =>
      onExternalChange((keys) => {
        if (keys.some((k) => k === TEMPLATES_KEY || k === AUTOMATIONS_KEY || k === RUNLOG_KEY || k === FOLDERS_KEY)) reload();
      }),
    [reload],
  );

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

  const persistTemplates = (f: Template[] | ((prev: Template[]) => Template[])) => {
    const list = typeof f === 'function' ? f(tplRef.current) : f;
    tplRef.current = list;
    setUserTemplates(list);
    AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(list)).catch(() => {});
  };
  const persistFolders = (f: (prev: Folder[]) => Folder[]) => {
    const list = f(foldersRef.current);
    foldersRef.current = list;
    setFolders(list);
    AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(list)).catch(() => {});
  };
  const persistAutomations = (list: Automation[]) => {
    setAutomations(list);
    AsyncStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(list)).catch(() => {});
  };

  const value = useMemo<LibraryApi>(
    () => ({
      templates: [...userTemplates, ...builtinTemplates()],
      userTemplates,
      saveTemplate: (name, description, icon, messages, extra) => {
        const id = uid();
        const now = new Date().toISOString();
        persistTemplates((prev) => [
          { id, name: name.trim() || 'Mon modèle', description, icon, createdAt: now, updatedAt: now, ...extra, builtin: false, messages: messages.map((m) => ({ ...cloneMessage(m), attachments: [] })) },
          ...prev,
        ]);
        return id;
      },
      deleteTemplate: (id) => persistTemplates((prev) => prev.filter((x) => x.id !== id)),
      updateTemplates: (ids, patch) => {
        const set = new Set(ids);
        const now = new Date().toISOString();
        persistTemplates((prev) => prev.map((x) => (set.has(x.id) ? { ...x, ...patch(x), updatedAt: now } : x)));
      },
      deleteTemplates: (ids) => {
        const set = new Set(ids);
        persistTemplates((prev) => prev.filter((x) => !set.has(x.id)));
      },
      addTemplates: (list) => persistTemplates((prev) => [...list, ...prev]),
      folders,
      createFolder: (name, color) => {
        const id = uid();
        persistFolders((prev) => [...prev, { id, name: name.trim() || 'Dossier', color: color ?? FOLDER_COLORS[prev.length % FOLDER_COLORS.length], createdAt: new Date().toISOString() }]);
        return id;
      },
      updateFolder: (id, patch) => persistFolders((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      deleteFolder: (id) => persistFolders((prev) => prev.filter((x) => x.id !== id)),
      addFolders: (list) => persistFolders((prev) => [...prev, ...list.filter((f) => !prev.some((p) => p.id === f.id))]),
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
    [userTemplates, automations, log, folders, reload],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const c = useContext(LibraryContext);
  if (!c) throw new Error('useLibrary hors LibraryProvider');
  return c;
}
