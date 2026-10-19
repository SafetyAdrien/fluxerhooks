import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadUiMemory } from './uiMemory';
import { addEntry, applyKeepingUi, contentSignature, HISTORY_KEY, loadHistory, record, redoTarget, saveHistory, undoTarget, type HistoryData } from './history';
import { onExternalChange } from '../link/storageHook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Backup, DraftMessage, EditorState, Embed, EmbedField, WebhookTarget } from '../types';
import { cloneEmbed, cloneMessage, moveItem, newEmbed, newField, newMessage, newTarget, uid, welcomeState } from '../utils/factory';

const KEY = 'fluxerhooks:editor:v1';
const BACKUPS_KEY = 'fluxerhooks:backups:v1';

type Updater<T> = Partial<T> | ((prev: T) => Partial<T>);
const apply = <T,>(prev: T, u: Updater<T>): T => ({ ...prev, ...(typeof u === 'function' ? (u as any)(prev) : u) });

interface EditorApi {
  state: EditorState;
  ready: boolean;
  replace: (s: EditorState) => void;
  clearAll: () => void;
  // cibles
  addTarget: (url?: string) => void;
  updateTarget: (id: string, u: Updater<WebhookTarget>) => void;
  removeTarget: (id: string) => void;
  // messages
  addMessage: (m?: DraftMessage) => void;
  updateMessage: (id: string, u: Updater<DraftMessage>) => void;
  removeMessage: (id: string) => void;
  duplicateMessage: (id: string) => void;
  moveMessage: (id: string, delta: number) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  // embeds
  addEmbed: (mid: string) => void;
  updateEmbed: (mid: string, eid: string, u: Updater<Embed>) => void;
  removeEmbed: (mid: string, eid: string) => void;
  duplicateEmbed: (mid: string, eid: string) => void;
  moveEmbed: (mid: string, eid: string, delta: number) => void;
  // champs
  addField: (mid: string, eid: string) => void;
  updateField: (mid: string, eid: string, fid: string, u: Updater<EmbedField>) => void;
  removeField: (mid: string, eid: string, fid: string) => void;
  moveField: (mid: string, eid: string, fid: string, delta: number) => void;
  // sauvegardes
  backups: Backup[];
  saveBackup: (name: string) => void;
  deleteBackup: (id: string) => void;
  renameBackup: (id: string, name: string) => void;
  // historique d'édition
  history: HistoryData;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Revient à n'importe quelle étape de la chronologie. */
  restoreEntry: (id: string) => void;
  /** Vide l'historique en gardant l'état actuel comme point de départ. */
  clearHistory: () => void;
}

const EditorContext = createContext<EditorApi | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EditorState>(() => welcomeState());
  const [backups, setBackups] = useState<Backup[]>([]);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [history, setHistory] = useState<HistoryData>({ entries: [], cursor: null });
  const recorded = useRef<{ state: EditorState; sig: string } | null>(null);
  /** Libellé imposé pour la prochaine étape (import, effacement…). */
  const nextLabel = useRef<{ kind: 'import' | 'remove'; label: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as EditorState;
          // L'état replié/déplié de chaque message est conservé tel que l'utilisateur l'a laissé.
          if (parsed?.messages?.length) setState(parsed);
        }
        await loadUiMemory();
        const b = await AsyncStorage.getItem(BACKUPS_KEY);
        const list: Backup[] = b ? JSON.parse(b) : [];
        setBackups(list);
        // Historique : repris s'il existe, sinon construit depuis les sauvegardes et le brouillon existants.
        let current = welcomeState();
        if (raw) {
          const parsed = JSON.parse(raw) as EditorState;
          if (parsed?.messages?.length) current = parsed;
        }
        const h = await loadHistory(current, list);
        recorded.current = { state: current, sig: contentSignature(current) };
        setHistory(h);
        saveHistory(h);
      } catch {
        // brouillon corrompu : on repart du message d'accueil
      }
      setReady(true);
    })();
  }, []);

  // Sauvegardes ou historique modifiés sur un appareil lié : affichés tout de suite. Le brouillon en
  // cours (éditeur et aperçu) n'est pas synchronisé : chaque appareil garde le sien.
  useEffect(
    () =>
      onExternalChange(async (keys) => {
        try {
          if (keys.includes(BACKUPS_KEY)) {
            const b = await AsyncStorage.getItem(BACKUPS_KEY);
            setBackups(b ? JSON.parse(b) : []);
          }
          if (keys.includes(HISTORY_KEY)) {
            const h = await AsyncStorage.getItem(HISTORY_KEY);
            if (h) {
              const parsed = JSON.parse(h) as HistoryData;
              setHistory(parsed);
              // Remplace une sauvegarde différée de l'ancien historique (même contenu : rien n'est renvoyé).
              saveHistory(parsed);
            }
          }
        } catch {
          // données illisibles : on garde l'état actuel
        }
      }),
    [],
  );

  // Sauvegarde automatique du brouillon (débounce 400 ms).
  useEffect(() => {
    if (!ready) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
    }, 400);
  }, [state, ready]);

  // Chaque modification du contenu devient une étape de l'historique.
  useEffect(() => {
    if (!ready || !recorded.current) return;
    const sig = contentSignature(state);
    if (sig === recorded.current.sig) return;
    const prev = recorded.current.state;
    recorded.current = { state, sig };
    const forced = nextLabel.current;
    nextLabel.current = null;
    setHistory((h) => {
      const n = forced ? addEntry(h, forced.kind, forced.label, state) : record(h, prev, state);
      saveHistory(n);
      return n;
    });
  }, [state, ready]);

  const historyRef = useRef(history);
  historyRef.current = history;
  const stateRef = useRef(state);
  stateRef.current = state;
  const jumpTo = useCallback((id: string | null | undefined) => {
    const h = historyRef.current;
    const e = id ? h.entries.find((x) => x.id === id) : null;
    if (!e) return;
    const next = applyKeepingUi(stateRef.current, e.state);
    recorded.current = { state: next, sig: contentSignature(next) };
    const n = { ...h, cursor: e.id };
    setState(next);
    setHistory(n);
    saveHistory(n);
  }, []);

  const persistBackups = (b: Backup[]) => {
    setBackups(b);
    AsyncStorage.setItem(BACKUPS_KEY, JSON.stringify(b)).catch(() => {});
  };

  const mapMsg = useCallback(
    (id: string, f: (m: DraftMessage) => DraftMessage) =>
      setState((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? f(m) : m)) })),
    [],
  );
  const mapEmbed = useCallback(
    (mid: string, eid: string, f: (e: Embed) => Embed) =>
      mapMsg(mid, (m) => ({ ...m, embeds: m.embeds.map((e) => (e.id === eid ? f(e) : e)) })),
    [mapMsg],
  );

  const api = useMemo<Omit<EditorApi, 'state' | 'ready' | 'backups' | 'history' | 'canUndo' | 'canRedo' | 'undo' | 'redo' | 'restoreEntry' | 'clearHistory'>>(
    () => ({
      replace: (s) => {
        nextLabel.current = { kind: 'import', label: 'Brouillon remplacé (import, sauvegarde ou modèle)' };
        setState(s);
      },
      clearAll: () => {
        nextLabel.current = { kind: 'remove', label: 'Brouillon vidé' };
        setState({ targets: [newTarget()], messages: [newMessage()] });
      },
      addTarget: (url) => setState((s) => ({ ...s, targets: [...s.targets, newTarget(url)] })),
      updateTarget: (id, u) =>
        setState((s) => ({ ...s, targets: s.targets.map((t) => (t.id === id ? apply(t, u) : t)) })),
      removeTarget: (id) =>
        setState((s) => {
          const targets = s.targets.filter((t) => t.id !== id);
          return { ...s, targets: targets.length ? targets : [newTarget()] };
        }),
      addMessage: (m) => setState((s) => ({ ...s, messages: [...s.messages, m ?? newMessage()] })),
      updateMessage: (id, u) => mapMsg(id, (m) => apply(m, u)),
      removeMessage: (id) =>
        setState((s) => {
          const messages = s.messages.filter((m) => m.id !== id);
          return { ...s, messages: messages.length ? messages : [newMessage()] };
        }),
      duplicateMessage: (id) =>
        setState((s) => {
          const i = s.messages.findIndex((m) => m.id === id);
          if (i < 0) return s;
          const copy = s.messages.slice();
          copy.splice(i + 1, 0, cloneMessage(s.messages[i]));
          return { ...s, messages: copy };
        }),
      moveMessage: (id, delta) =>
        setState((s) => ({ ...s, messages: moveItem(s.messages, s.messages.findIndex((m) => m.id === id), delta) })),
      setAllCollapsed: (collapsed) =>
        setState((s) => ({ ...s, messages: s.messages.map((m) => ({ ...m, collapsed })) })),
      addEmbed: (mid) => mapMsg(mid, (m) => ({ ...m, embeds: [...m.embeds, newEmbed()] })),
      updateEmbed: (mid, eid, u) => mapEmbed(mid, eid, (e) => apply(e, u)),
      removeEmbed: (mid, eid) => mapMsg(mid, (m) => ({ ...m, embeds: m.embeds.filter((e) => e.id !== eid) })),
      duplicateEmbed: (mid, eid) =>
        mapMsg(mid, (m) => {
          const i = m.embeds.findIndex((e) => e.id === eid);
          if (i < 0) return m;
          const embeds = m.embeds.slice();
          embeds.splice(i + 1, 0, cloneEmbed(m.embeds[i]));
          return { ...m, embeds };
        }),
      moveEmbed: (mid, eid, delta) =>
        mapMsg(mid, (m) => ({ ...m, embeds: moveItem(m.embeds, m.embeds.findIndex((e) => e.id === eid), delta) })),
      addField: (mid, eid) => mapEmbed(mid, eid, (e) => ({ ...e, fields: [...e.fields, newField()] })),
      updateField: (mid, eid, fid, u) =>
        mapEmbed(mid, eid, (e) => ({ ...e, fields: e.fields.map((f) => (f.id === fid ? apply(f, u) : f)) })),
      removeField: (mid, eid, fid) =>
        mapEmbed(mid, eid, (e) => ({ ...e, fields: e.fields.filter((f) => f.id !== fid) })),
      moveField: (mid, eid, fid, delta) =>
        mapEmbed(mid, eid, (e) => ({ ...e, fields: moveItem(e.fields, e.fields.findIndex((f) => f.id === fid), delta) })),
      saveBackup: () => {},
      deleteBackup: () => {},
      renameBackup: () => {},
    }),
    [mapMsg, mapEmbed],
  );

  const value: EditorApi = {
    ...api,
    state,
    ready,
    backups,
    saveBackup: (name) =>
      persistBackups([
        { id: uid(), name: name.trim() || `Sauvegarde ${backups.length + 1}`, createdAt: new Date().toISOString(), state },
        ...backups,
      ]),
    deleteBackup: (id) => persistBackups(backups.filter((b) => b.id !== id)),
    renameBackup: (id, name) => persistBackups(backups.map((b) => (b.id === id ? { ...b, name } : b))),
    history,
    canUndo: !!undoTarget(history),
    canRedo: !!redoTarget(history),
    undo: () => jumpTo(undoTarget(history)?.id),
    redo: () => jumpTo(redoTarget(history)?.id),
    restoreEntry: (id) => jumpTo(id),
    clearHistory: () => {
      const n = addEntry({ entries: [], cursor: null }, 'initial', 'Point de départ', state);
      setHistory(n);
      saveHistory(n);
    },
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const c = useContext(EditorContext);
  if (!c) throw new Error('useEditor hors EditorProvider');
  return c;
}
