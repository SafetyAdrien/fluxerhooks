/**
 * Automatisations : liste, édition et journal (affichés dans la page Données).
 */
import React, { useMemo, useState } from 'react';
import { tr } from '../i18n';
import { Alert, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEditor } from '../state/editor';
import { useSettings } from '../state/settings';
import { useLibrary } from '../state/library';
import { VARIABLES, describeSchedule, WEEKDAYS } from '../state/automation';
import { uid } from '../utils/factory';
import { isSendableUrl } from '../utils/parse';
import { Box, Button, Chip, EmptyState, IconBtn, Input, Segmented, Stack, ToggleRow, useToast, type IconName } from '../components/ui';
import { Dropdown } from '../components/Dropdown';
import type { Automation, ScheduleKind } from '../types';

/* ---------- Automatisations ---------- */

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
function fromLocalInput(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  return isNaN(d.getTime()) ? null : d;
}

function AutomationEditor({ initial, preset, onDone }: { initial?: Automation; preset?: string; onDone: () => void }) {
  const { theme: t } = useSettings();
  const { backups, state } = useEditor();
  const { templates, upsertAutomation } = useLibrary();
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [source, setSource] = useState(initial ? `${initial.source.kind}:${initial.source.id}` : preset ?? '');
  const [useCurrent, setUseCurrent] = useState(initial ? initial.targets.length > 0 : true);
  const [kind, setKind] = useState<ScheduleKind>(initial?.schedule.kind ?? 'daily');
  const [when, setWhen] = useState(toLocalInput(initial ? new Date(initial.schedule.at) : new Date(Date.now() + 3600_000)));
  const [every, setEvery] = useState(String(initial?.schedule.everyMinutes ?? 60));
  const [days, setDays] = useState<number[]>(initial?.schedule.weekdays ?? [new Date().getDay()]);
  const currentTargets = state.targets.filter((x) => x.enabled && isSendableUrl(x.url)).map((x) => x.url);
  const date = fromLocalInput(when);

  const options = useMemo(
    () => [
      ...backups.map((b) => ({ value: `backup:${b.id}`, label: b.name, subtitle: `${b.state.messages.length} message(s)`, group: 'Sauvegardes', left: <Ionicons name="archive-outline" size={t.z(18)} color={t.textMuted} /> })),
      ...templates.map((x) => ({ value: `template:${x.id}`, label: x.name, subtitle: x.description, group: 'Modèles', left: <Ionicons name={x.icon as IconName} size={t.z(18)} color={t.textMuted} /> })),
    ],
    [backups, templates, t],
  );

  const save = () => {
    if (!date) return toast('Date invalide : utilise JJ/MM/AAAA HH:MM.', 'error');
    const [k, id] = source.split(':');
    const a: Automation = {
      id: initial?.id ?? uid(),
      name: name.trim() || 'Automatisation',
      enabled: true,
      source: { kind: k as 'backup' | 'template', id },
      targets: useCurrent ? currentTargets : [],
      schedule: { kind, at: date.toISOString(), everyMinutes: Math.max(15, Number(every) || 60), weekdays: days },
      nextRun: null,
      lastRun: initial?.lastRun,
      lastResult: initial?.lastResult,
      runs: initial?.runs ?? 0,
    };
    if (k === 'template' && !a.targets.length) return toast('Un modèle n’a pas de destination : garde « destinations actuelles » activé.', 'error');
    upsertAutomation(a);
    toast('Automatisation enregistrée.', 'success');
    onDone();
  };

  return (
    <Box title={initial ? 'Modifier l’automatisation' : 'Nouvelle automatisation'} icon="timer-outline" collapsible={false}>
      <Input label="Nom" value={name} onChangeText={setName} placeholder="Ex : Rappel du règlement" max={60} />
      <Dropdown label="Messages à envoyer" title="Source" placeholder="Choisir une sauvegarde ou un modèle" value={source || null} options={options} onChange={setSource} emptyText="Crée d’abord une sauvegarde ou un modèle." />
      <ToggleRow
        icon="link-outline"
        label="Utiliser les destinations actuelles (webhooks et salons du bot)"
        description={useCurrent ? `${currentTargets.length} webhook(s) du brouillon` : 'Webhooks enregistrés dans la sauvegarde'}
        value={useCurrent}
        onChange={setUseCurrent}
      />
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'once', label: 'Une fois' },
          { value: 'interval', label: 'Intervalle' },
          { value: 'daily', label: 'Jour' },
          { value: 'weekly', label: 'Semaine' },
        ]}
      />
      <Input
        label={kind === 'once' ? 'Date et heure' : kind === 'interval' ? 'Premier envoi' : 'Heure (et date de début)'}
        value={when}
        onChangeText={setWhen}
        placeholder="JJ/MM/AAAA HH:MM"
        error={date ? null : 'Format JJ/MM/AAAA HH:MM'}
        keyboardType="numbers-and-punctuation"
        mono
      />
      {kind === 'interval' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {[15, 30, 60, 120, 360, 720, 1440, 10080].map((m) => (
            <Chip key={m} label={m < 60 ? `${m} min` : m < 1440 ? `${m / 60} h` : m === 1440 ? '1 jour' : '1 semaine'} selected={Number(every) === m} onPress={() => setEvery(String(m))} />
          ))}
        </View>
      )}
      {kind === 'weekly' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {WEEKDAYS.map((d, i) => (
            <Chip key={d} label={d} selected={days.includes(i)} onPress={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])} />
          ))}
        </View>
      )}
      <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>
        {tr("Variables :")} {VARIABLES.map((v) => `${v.key} (${v.label.toLowerCase()})`).join(' · ')}
      </Text>
      <Stack row gap={8}>
        <Button flex label="Annuler" onPress={onDone} />
        <Button flex variant="primary" icon="checkmark" label="Enregistrer" disabled={!source} onPress={save} />
      </Stack>
    </Box>
  );
}

/** Automatisations (page Données). `preset` : source à préremplir (« Programmer » depuis un élément). */
export function Automations({ preset, onPresetUsed, query = '' }: { preset?: string | null; onPresetUsed?: () => void; query?: string }) {
  const { theme: t } = useSettings();
  const { automations: all, toggleAutomation, deleteAutomation, runNow, log } = useLibrary();
  const toast = useToast();
  const [editing, setEditing] = useState<Automation | 'new' | null>(preset ? 'new' : null);
  const [busy, setBusy] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const automations = q ? all.filter((a) => a.name.toLowerCase().includes(q)) : all;

  if (editing)
    return (
      <AutomationEditor
        initial={editing === 'new' ? undefined : editing}
        preset={editing === 'new' ? preset ?? undefined : undefined}
        onDone={() => {
          setEditing(null);
          onPresetUsed?.();
        }}
      />
    );
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: t.radiusSm, backgroundColor: t.accentSoft }}>
        <Ionicons name="information-circle-outline" size={t.z(18)} color={t.accent} />
        <Text style={{ color: t.text, flex: 1, fontSize: t.font(12), lineHeight: t.font(17) }}>
          {tr("Les envois partent depuis ton téléphone. Android lance la vérification en arrière-plan environ toutes les 15 minutes (parfois moins souvent en économie d’énergie) ; les envois en retard partent dès que tu ouvres l’app.")}
        </Text>
      </View>
      <Button variant="primary" icon="add" label="Nouvelle automatisation" onPress={() => setEditing('new')} />
      {!automations.length && !q && <EmptyState icon="timer-outline" title="Aucune automatisation" text="Programme l’envoi d’une sauvegarde ou d’un modèle : une fois, chaque jour, chaque semaine ou à intervalle." />}
      {automations.map((a) => (
        <View key={a.id} style={{ backgroundColor: t.surface, borderRadius: t.radius, padding: t.pad, gap: 6, borderWidth: 1, borderColor: a.enabled ? t.accent : t.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="timer-outline" size={t.z(20)} color={a.enabled ? t.accent : t.textFaint} />
            <Text style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: t.font(15) }}>{a.name}</Text>
            <Switch value={a.enabled} onValueChange={(v) => toggleAutomation(a.id, v)} trackColor={{ false: t.border, true: t.accentSoft }} thumbColor={a.enabled ? t.accent : t.textFaint} />
          </View>
          <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>{describeSchedule(a)}</Text>
          <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>
            {a.enabled && a.nextRun ? `Prochain envoi : ${new Date(a.nextRun).toLocaleString('fr-FR')}` : 'En pause'} · {a.runs} exécution(s)
          </Text>
          {!!a.lastResult && <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr("Dernier :")} {a.lastResult}</Text>}
          <Stack row gap={6}>
            <Button small icon="play" label="Lancer" loading={busy === a.id} onPress={async () => { setBusy(a.id); const r = await runNow(a.id); setBusy(null); toast(r, r.includes('échec') || r.startsWith('Aucun') ? 'error' : 'success'); }} />
            <Button small icon="create-outline" label="Modifier" onPress={() => setEditing(a)} />
            <View style={{ flex: 1 }} />
            <IconBtn icon="trash-outline" label="Supprimer" color={t.danger} onPress={() => Alert.alert('Supprimer cette automatisation ?', undefined, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: () => deleteAutomation(a.id) }])} />
          </Stack>
        </View>
      ))}
      {!!log.length && (
        <Box title="Historique" icon="time-outline" defaultCollapsed badge={String(log.length)}>
          {log.slice(0, 20).map((l, i) => (
            <Text key={i} style={{ color: t.textMuted, fontSize: t.font(12) }}>
              {new Date(l.at).toLocaleString('fr-FR')} · {l.name} — {l.result}
            </Text>
          ))}
        </Box>
      )}
    </>
  );
}
