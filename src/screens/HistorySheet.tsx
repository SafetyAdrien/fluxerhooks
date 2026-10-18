import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Dialog, EmptyState, Sheet, Stack, useToast } from '../components/ui';
import { useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { currentLocale, tr } from '../i18n';
import { HISTORY_MAX, type HistoryEntry, type HistoryKind } from '../state/history';

/**
 * Chronologie de l'historique d'édition : chaque étape se restaure d'un toucher ;
 * les étapes abandonnées par une annulation restent visibles (« autre branche »).
 */

const KIND_ICON: Record<HistoryKind, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  edit: 'pencil-outline',
  add: 'plus-circle-outline',
  remove: 'minus-circle-outline',
  move: 'swap-vertical',
  restore: 'backup-restore',
  import: 'tray-arrow-down',
  backup: 'content-save-outline',
  initial: 'flag-outline',
};

const label = (e: HistoryEntry) => tr(e.label, e.vars ? Object.fromEntries(Object.entries(e.vars).map(([k, v]) => [k, typeof v === 'string' ? tr(v) : v])) : undefined);

function summary(e: HistoryEntry) {
  const msgs = e.state.messages.length;
  const embeds = e.state.messages.reduce((n, m) => n + m.embeds.length, 0);
  const chars = e.state.messages.reduce((n, m) => n + m.content.length + m.embeds.reduce((k, x) => k + x.title.length + x.description.length, 0), 0);
  return tr('{m} msg · {e} embed(s) · {c} caractères', { m: msgs, e: embeds, c: chars });
}

export function HistorySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme: t, haptic } = useSettings();
  const toast = useToast();
  const { history, undo, redo, canUndo, canRedo, restoreEntry, clearHistory } = useEditor();
  const [confirmClear, setConfirmClear] = useState(false);

  // Étapes menant à l'état actuel (le reste = autres branches).
  const path = useMemo(() => {
    const byId = new Map(history.entries.map((e) => [e.id, e]));
    const set = new Set<string>();
    let id = history.cursor;
    while (id && !set.has(id)) {
      set.add(id);
      id = byId.get(id)?.parent ?? null;
    }
    // …et celles qu'on retrouve avec « Rétablir » (enfant le plus récent, de proche en proche).
    let head = history.cursor;
    while (head) {
      const kids = history.entries.filter((e) => e.parent === head);
      if (!kids.length) break;
      const next = kids.reduce((x, y) => (y.at > x.at ? y : x));
      if (set.has(next.id)) break;
      set.add(next.id);
      head = next.id;
    }
    return set;
  }, [history]);

  const groups = useMemo(() => {
    const list = history.entries.slice().reverse();
    const out: { day: string; items: HistoryEntry[] }[] = [];
    const fmt = new Intl.DateTimeFormat(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    for (const e of list) {
      const day = fmt.format(new Date(e.at));
      if (out[out.length - 1]?.day === day) out[out.length - 1].items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [history]);

  const time = new Intl.DateTimeFormat(currentLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <Sheet visible={visible} onClose={onClose} title="Historique d’édition" fullscreen>
      <Stack>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button flex icon="arrow-undo-outline" label="Annuler la modification" disabled={!canUndo} onPress={() => (haptic('light'), undo())} />
          <Button flex icon="arrow-redo-outline" label="Rétablir la modification" disabled={!canRedo} onPress={() => (haptic('light'), redo())} />
        </View>
        <Text style={{ color: t.textMuted, fontSize: t.font(12), lineHeight: t.font(17) }}>
          {tr('Chaque modification de l’éditeur est enregistrée ({n} dernières étapes). Touche une étape pour y revenir : rien n’est perdu, tu peux toujours revenir en avant.', { n: HISTORY_MAX })}
        </Text>

        {!history.entries.length && <EmptyState icon="time-outline" title="Aucune modification" text="Les modifications apparaîtront ici dès que tu modifieras l’éditeur." />}

        {groups.map((g) => (
          <View key={g.day} style={{ gap: 6 }}>
            <Text style={{ color: t.textMuted, fontWeight: '800', fontSize: t.font(12), letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 6 }}>{g.day}</Text>
            {g.items.map((e) => {
              const current = e.id === history.cursor;
              const onPath = path.has(e.id);
              return (
                <Pressable
                  key={e.id}
                  onPress={() => {
                    if (current) return;
                    haptic('light');
                    restoreEntry(e.id);
                    toast(tr('Revenu à : {l}', { l: label(e) }), 'success');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={label(e)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 10,
                    borderRadius: t.radiusSm,
                    borderWidth: current ? 1.5 : 1,
                    borderColor: current ? t.accent : t.border,
                    backgroundColor: pressed ? t.surface2 : current ? t.accentSoft : t.surface,
                    opacity: onPath ? 1 : 0.62,
                  })}
                >
                  <View style={{ width: t.z(34), height: t.z(34), borderRadius: t.z(10), alignItems: 'center', justifyContent: 'center', backgroundColor: current ? t.accent : t.surface2 }}>
                    <MaterialCommunityIcons name={KIND_ICON[e.kind] ?? 'pencil-outline'} size={t.z(18)} color={current ? t.onAccent : t.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ color: t.text, fontWeight: '700', fontSize: t.font(14) }}>
                      {label(e)}
                    </Text>
                    <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(11) }}>
                      {time.format(new Date(e.at))} · {summary(e)}
                    </Text>
                  </View>
                  {current ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.accent }}>
                      <Text style={{ color: t.onAccent, fontWeight: '800', fontSize: t.font(10) }}>{tr('ACTUEL')}</Text>
                    </View>
                  ) : !onPath ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <MaterialCommunityIcons name="source-branch" size={t.z(14)} color={t.textMuted} />
                      <Text style={{ color: t.textMuted, fontSize: t.font(10), fontWeight: '700' }}>{tr('autre branche')}</Text>
                    </View>
                  ) : (
                    <MaterialCommunityIcons name="backup-restore" size={t.z(18)} color={t.textMuted} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        {history.entries.length > 1 && <Button variant="danger" icon="trash-outline" label="Vider l’historique" onPress={() => setConfirmClear(true)} />}
      </Stack>
      <Dialog visible={confirmClear} onClose={() => setConfirmClear(false)} title="Vider l’historique ?" icon="trash-outline">
        <Stack>
          <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>{tr('Le brouillon actuel est conservé et devient le nouveau point de départ.')}</Text>
          <Button
            variant="danger"
            label="Vider"
            onPress={() => {
              clearHistory();
              setConfirmClear(false);
              toast(tr('Historique vidé'), 'success');
            }}
          />
        </Stack>
      </Dialog>
    </Sheet>
  );
}
