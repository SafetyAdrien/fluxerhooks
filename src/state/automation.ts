import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveEndpoints, sendToTarget } from '../api/fluxer';
import type { Automation, Backup, DraftMessage, Template } from '../types';
import { isSendableUrl, parseBotTarget } from '../utils/parse';
import { builtinTemplates } from './templates';

/**
 * Moteur d'automatisations : envois programmés (une fois, intervalle, quotidien, hebdomadaire).
 * Fonctions pures + stockage, utilisables depuis l'app ou la tâche de fond Android.
 */

export const AUTOMATIONS_KEY = 'fluxerhooks:automations:v1';
export const TEMPLATES_KEY = 'fluxerhooks:templates:v1';
export const BACKUPS_KEY = 'fluxerhooks:backups:v1';
export const SETTINGS_KEY = 'fluxerhooks:settings:v1';
export const RUNLOG_KEY = 'fluxerhooks:automation-log:v1';

export const WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/** Prochaine exécution strictement après `from`. */
export function computeNextRun(a: Automation, from: Date = new Date()): string | null {
  const start = new Date(a.schedule.at);
  if (isNaN(start.getTime())) return null;
  const k = a.schedule.kind;
  if (k === 'once') return start > from ? start.toISOString() : null;
  if (k === 'interval') {
    const step = Math.max(15, a.schedule.everyMinutes ?? 60) * 60_000;
    if (start > from) return start.toISOString();
    const n = Math.floor((from.getTime() - start.getTime()) / step) + 1;
    return new Date(start.getTime() + n * step).toISOString();
  }
  // daily / weekly : même heure que `at`
  const days = k === 'weekly' ? (a.schedule.weekdays?.length ? a.schedule.weekdays : [start.getDay()]) : [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i < 8; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(start.getHours(), start.getMinutes(), 0, 0);
    if (d > from && d >= new Date(start.getTime() - 60_000) && days.includes(d.getDay())) return d.toISOString();
  }
  return null;
}

export function describeSchedule(a: Automation): string {
  const d = new Date(a.schedule.at);
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  switch (a.schedule.kind) {
    case 'once':
      return `Une fois, le ${d.toLocaleDateString('fr-FR')} à ${hm}`;
    case 'interval': {
      const m = a.schedule.everyMinutes ?? 60;
      return m % 1440 === 0 ? `Tous les ${m / 1440} jour(s)` : m % 60 === 0 ? `Toutes les ${m / 60} heure(s)` : `Toutes les ${m} minutes`;
    }
    case 'daily':
      return `Chaque jour à ${hm}`;
    case 'weekly':
      return `Chaque ${(a.schedule.weekdays ?? [d.getDay()]).map((x) => WEEKDAYS[x]).join(', ')} à ${hm}`;
  }
}

/** Variables utilisables dans les messages automatisés. */
export const VARIABLES = [
  { key: '{date}', label: 'Date du jour' },
  { key: '{heure}', label: 'Heure de l’envoi' },
  { key: '{jour}', label: 'Jour de la semaine' },
  { key: '{compteur}', label: 'Numéro d’exécution' },
  { key: '{timestamp}', label: 'Horodatage Fluxer <t:…>' },
];

function applyVars(text: string, runs: number, now: Date) {
  return text
    .replace(/\{date\}/g, now.toLocaleDateString('fr-FR'))
    .replace(/\{heure\}/g, now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{jour\}/g, now.toLocaleDateString('fr-FR', { weekday: 'long' }))
    .replace(/\{compteur\}/g, String(runs + 1))
    .replace(/\{timestamp\}/g, `<t:${Math.floor(now.getTime() / 1000)}:F>`);
}

function withVars(m: DraftMessage, runs: number, now: Date): DraftMessage {
  const v = (s: string) => applyVars(s, runs, now);
  return {
    ...m,
    content: v(m.content),
    thread_name: v(m.thread_name),
    // Pas de fichiers locaux en arrière-plan, et toujours un nouveau message.
    attachments: [],
    reference: '',
    embeds: m.embeds.map((e) => ({
      ...e,
      title: v(e.title),
      description: v(e.description),
      footer: { ...e.footer, text: v(e.footer.text) },
      author: { ...e.author, name: v(e.author.name) },
      fields: e.fields.map((f) => ({ ...f, name: v(f.name), value: v(f.value) })),
      timestamp: e.timestamp ? now.toISOString() : null,
    })),
  };
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function loadSource(a: Automation): Promise<{ messages: DraftMessage[]; targets: string[] } | null> {
  if (a.source.kind === 'backup') {
    const backups = await readJson<Backup[]>(BACKUPS_KEY, []);
    const b = backups.find((x) => x.id === a.source.id);
    return b ? { messages: b.state.messages, targets: b.state.targets.filter((x) => x.enabled).map((x) => x.url) } : null;
  }
  const templates = [...builtinTemplates(), ...(await readJson<Template[]>(TEMPLATES_KEY, []))];
  const tpl = templates.find((x) => x.id === a.source.id);
  return tpl ? { messages: tpl.messages, targets: [] } : null;
}

/** Exécute une automatisation maintenant ; renvoie le résumé. */
export async function runAutomation(a: Automation): Promise<string> {
  const src = await loadSource(a);
  if (!src) return 'Source introuvable (sauvegarde ou modèle supprimé).';
  const targets = (a.targets.length ? a.targets : src.targets).filter((u) => isSendableUrl(u));
  if (!targets.length) return 'Aucune destination valide (webhook ou salon du bot).';
  // Token du bot (stocké chiffré) pour les destinations « bot:<salon> ».
  let botToken: string | undefined;
  if (targets.some((u) => parseBotTarget(u))) {
    try {
      const SecureStore = await import('expo-secure-store');
      botToken = (await SecureStore.getItemAsync('fluxerhooks_bot_token')) ?? undefined;
    } catch {
      botToken = undefined;
    }
  }
  const settings = await readJson<{ instance?: string }>(SETTINGS_KEY, {});
  const ep = await resolveEndpoints(settings.instance || 'https://fluxer.app');
  const now = new Date();
  let ok = 0;
  const errors: string[] = [];
  for (const m of src.messages) {
    for (const url of targets) {
      try {
        await sendToTarget(ep, url, withVars(m, a.runs, now), botToken);
        ok++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }
  return errors.length ? `${ok} envoyé(s), ${errors.length} échec(s) : ${errors[0]}` : `${ok} message(s) envoyé(s)`;
}

/** Lance toutes les automatisations échues et sauvegarde leur nouvel état. Renvoie le nombre exécuté. */
export async function runDueAutomations(): Promise<number> {
  const list = await readJson<Automation[]>(AUTOMATIONS_KEY, []);
  const now = new Date();
  let count = 0;
  for (const a of list) {
    if (!a.enabled || !a.nextRun || new Date(a.nextRun) > now) continue;
    a.lastResult = await runAutomation(a);
    a.lastRun = new Date().toISOString();
    a.runs += 1;
    a.nextRun = computeNextRun(a, new Date());
    if (!a.nextRun && a.schedule.kind === 'once') a.enabled = false;
    count++;
  }
  if (count) {
    await AsyncStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(list));
    const log = await readJson<{ at: string; name: string; result: string }[]>(RUNLOG_KEY, []);
    const entries = list.filter((x) => x.lastRun && new Date(x.lastRun) >= now).map((x) => ({ at: x.lastRun!, name: x.name, result: x.lastResult ?? '' }));
    await AsyncStorage.setItem(RUNLOG_KEY, JSON.stringify([...entries, ...log].slice(0, 50)));
  }
  return count;
}
