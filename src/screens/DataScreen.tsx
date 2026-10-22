import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { currentLocale, tr } from '../i18n';
import { useSettings } from '../state/settings';
import { useEditor } from '../state/editor';
import { FOLDER_COLORS, useLibrary } from '../state/library';
import { allTags, buildItems, cleanTag, exportLibrary, filterItems, importLibrary, type Filters, type LibraryItem, type Scope, type SortKey } from '../state/libraryItems';
import { readPickedText, shareTextFile } from '../platform/files';
import { exportState } from '../utils/payload';
import { cloneMessage } from '../utils/factory';
import { PreviewList } from '../components/Preview';
import { DataTransfer } from '../components/DataTransfer';
import { Dropdown } from '../components/Dropdown';
import { Automations } from './AutomationsPanel';
import { BotSystems } from './BotSystemsPanel';
import { useBotSystems } from '../state/botSystems';
import { Badge, Box, Button, Chip, Dialog, EmptyState, IconBtn, Input, Segmented, useToast, type IconName } from '../components/ui';
import type { Backup, Folder, Template } from '../types';

/**
 * Page « Données » (ouverte depuis « Éditeur ») : bibliothèque des sauvegardes et des modèles
 * avec recherche, tri, filtres, dossiers, étiquettes, épingles, aperçu, actions par élément et
 * sélection multiple ; automatisations ; transfert et backup.
 * Grand écran : barre latérale + liste + panneau de détail. Téléphone : onglets, puis détail en plein écran.
 */

type Section = 'library' | 'automations' | 'transfer';

const TEMPLATE_ICONS: IconName[] = ['document-text-outline', 'megaphone-outline', 'shield-checkmark-outline', 'sparkles-outline', 'calendar-outline', 'heart-outline', 'rocket-outline', 'game-controller-outline'];

const fmtDate = (n: number, withTime = true) => {
  if (!n) return '—';
  try {
    return new Date(n).toLocaleString(currentLocale(), withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return new Date(n).toISOString().slice(0, 16).replace('T', ' ');
  }
};
const plural = (n: number, one: string, many: string) => tr(n === 1 ? one : many, { n });

/* ---------- Petites briques ---------- */

function Check({ on, size = 20 }: { on: boolean; size?: number }) {
  const { theme: t } = useSettings();
  return <MaterialCommunityIcons name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={t.z(size)} color={on ? t.accent : t.textFaint} />;
}

function FolderDot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

function TagPill({ tag, onRemove, small }: { tag: string; onRemove?: () => void; small?: boolean }) {
  const { theme: t } = useSettings();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 7, paddingRight: onRemove ? 3 : 7, paddingVertical: small ? 1 : 3, borderRadius: 999, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border }}>
      <Text style={{ color: t.textMuted, fontSize: t.font(small ? 11 : 12), fontWeight: '600' }}>#{tag}</Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={6} accessibilityLabel={tr('Retirer l’étiquette {tag}', { tag })} style={{ padding: 1 }}>
          <Ionicons name="close" size={t.z(13)} color={t.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

/** Ligne de navigation (barre latérale). */
function NavRow({ icon, label, count, active, onPress, color, right }: { icon?: IconName; label: string; count?: number; active?: boolean; onPress: () => void; color?: string; right?: React.ReactNode }) {
  const { theme: t } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: t.z(8),
        borderRadius: t.radiusSm,
        backgroundColor: active ? t.accentSoft : pressed || hovered ? t.surface2 : 'transparent',
      })}
    >
      {color ? <FolderDot color={color} /> : icon ? <Ionicons name={icon} size={t.z(17)} color={active ? t.accent : t.textMuted} /> : null}
      <Text numberOfLines={1} style={{ flex: 1, color: active ? t.text : t.textMuted, fontWeight: active ? '800' : '600', fontSize: t.font(14) }}>
        {label}
      </Text>
      {right}
      {count != null && <Text style={{ color: t.textFaint, fontSize: t.font(12), fontWeight: '700' }}>{count}</Text>}
    </Pressable>
  );
}

function GroupLabel({ children, right }: { children: string; right?: React.ReactNode }) {
  const { theme: t } = useSettings();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginTop: 14, marginBottom: 4 }}>
      <Text style={{ flex: 1, color: t.textFaint, fontSize: t.font(11), fontWeight: '800', letterSpacing: 0.7 }}>{tr(children).toUpperCase()}</Text>
      {right}
    </View>
  );
}

function SearchField({ value, onChange, placeholder, inRow = true }: { value: string; onChange: (s: string) => void; placeholder: string; inRow?: boolean }) {
  const { theme: t } = useSettings();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, height: t.z(40), paddingHorizontal: 12, borderRadius: t.radiusSm, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, minWidth: 0 }, inRow ? { flex: 1 } : { alignSelf: 'stretch' }]}>
      <Ionicons name="search" size={t.z(17)} color={t.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={tr(placeholder)}
        placeholderTextColor={t.textFaint}
        accessibilityLabel={tr(placeholder)}
        style={[{ flex: 1, minWidth: 0, color: t.text, fontSize: t.font(14), paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
      />
      {!!value && (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel={tr('Effacer la recherche')}>
          <Ionicons name="close-circle" size={t.z(17)} color={t.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

type McIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Bouton carré arrondi, même style que le bouton retour du header (fond discret, icône fine).
 * `label` : texte affiché à côté de l'icône (grand écran) ; `active` : état activé (accent) ;
 * `dot` : pastille d'indication (filtre actif).
 */
const SquareBtn = React.forwardRef<View, { icon: McIcon; label: string; onPress: () => void; showLabel?: boolean; active?: boolean; primary?: boolean; dot?: boolean; danger?: boolean; small?: boolean; disabled?: boolean }>(
  function SquareBtn({ icon, label, onPress, showLabel, active, primary, dot, danger, small, disabled }, ref) {
    const { theme: t, haptic } = useSettings();
    const size = t.z(small ? 34 : 40);
    const on = active || primary;
    const fg = on ? t.onAccent : danger ? t.danger : t.text;
    return (
      <Pressable
        ref={ref}
        onPress={() => {
          haptic('light');
          onPress();
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={tr(label)}
        accessibilityState={{ selected: !!active, disabled: !!disabled }}
        hitSlop={4}
        style={({ pressed, hovered }: any) => ({
          height: size,
          minWidth: size,
          paddingHorizontal: showLabel ? 12 : 0,
          flexDirection: 'row',
          gap: 6,
          borderRadius: t.z(small ? 12 : 14),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
          backgroundColor: on ? (pressed ? t.accentPressed : t.accent) : pressed ? t.accentSoft : hovered ? t.accentSoft : t.surface2,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <MaterialCommunityIcons name={icon} size={t.z(small ? 19 : 22)} color={fg} />
        {showLabel && <Text style={{ color: fg, fontSize: t.font(13), fontWeight: '700' }}>{tr(label)}</Text>}
        {dot && <View style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent, borderWidth: 1.5, borderColor: t.surface2 }} />}
      </Pressable>
    );
  },
);

/** Filtre par étiquette : petit conteneur ouvert sous l'icône « filtre ». */
function TagFilter({ tags, value, onChange, small }: { tags: { tag: string; count: number }[]; value: string | null; onChange: (tag: string | null) => void; small?: boolean }) {
  const { theme: t, base } = useSettings();
  const { width: winW, height: winH } = useWindowDimensions();
  const btn = useRef<View>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [q, setQ] = useState('');
  const W = Math.min(280, winW - 24);
  const open = () =>
    btn.current?.measureInWindow((x, y, w, h) => {
      setQ('');
      setPos({ x: Math.max(12, Math.min(x + w - W, winW - W - 12)), y: y + h + 6 });
    });
  const pick = (tag: string | null) => {
    onChange(tag);
    setPos(null);
  };
  const shown = tags.filter((x) => !q || x.tag.toLowerCase().includes(q.trim().replace(/^#/, '').toLowerCase()));
  const Row = ({ label, count, on, onPress }: { label: string; count?: number; on: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: t.z(8), borderRadius: t.radiusSm, backgroundColor: on ? t.accentSoft : pressed || hovered ? t.surface2 : 'transparent' })}
    >
      <MaterialCommunityIcons name={on ? 'check' : 'pound'} size={t.z(16)} color={on ? t.accent : t.textFaint} />
      <Text numberOfLines={1} style={{ flex: 1, color: on ? t.text : t.textMuted, fontWeight: on ? '800' : '600', fontSize: t.font(14) }}>{label}</Text>
      {count != null && <Text style={{ color: t.textFaint, fontSize: t.font(12), fontWeight: '700' }}>{count}</Text>}
    </Pressable>
  );
  return (
    <>
      <SquareBtn ref={btn} icon="filter-variant" label={value ? tr('Étiquette : #{tag}', { tag: value }) : 'Filtrer par étiquette'} active={!!value} small={small} onPress={open} />
      <Modal visible={!!pos} transparent animationType="fade" onRequestClose={() => setPos(null)} statusBarTranslucent>
        <Pressable style={{ flex: 1 }} onPress={() => setPos(null)} accessibilityLabel={tr('Fermer')} />
        {pos && (
          <View
            style={{
              position: 'absolute',
              left: pos.x,
              top: Math.min(pos.y, winH - 200),
              width: W,
              maxHeight: Math.max(200, Math.min(380, winH - pos.y - 24)),
              padding: 8,
              gap: 6,
              borderRadius: t.radius,
              backgroundColor: base.bgAlt,
              borderWidth: 1,
              borderColor: t.border,
              elevation: 16,
              shadowColor: '#000',
              shadowOpacity: 0.35,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <Text style={{ color: t.textFaint, fontSize: t.font(11), fontWeight: '800', letterSpacing: 0.7, paddingHorizontal: 6, paddingTop: 2 }}>{tr('Étiquettes').toUpperCase()}</Text>
            {tags.length > 8 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: t.z(36), paddingHorizontal: 10, borderRadius: t.radiusSm, backgroundColor: t.surface2 }}>
                <Ionicons name="search" size={t.z(15)} color={t.textFaint} />
                <TextInput value={q} onChangeText={setQ} placeholder={tr('Rechercher…')} placeholderTextColor={t.textFaint} autoFocus style={[{ flex: 1, minWidth: 0, color: t.text, fontSize: t.font(13), paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]} />
              </View>
            )}
            <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
              <Row label={tr('Toutes les étiquettes')} on={!value} onPress={() => pick(null)} />
              {shown.map((x) => (
                <Row key={x.tag} label={x.tag} count={x.count} on={value === x.tag} onPress={() => pick(value === x.tag ? null : x.tag)} />
              ))}
              {!tags.length && <Text style={{ color: t.textFaint, fontSize: t.font(12), padding: 10 }}>{tr('Aucune étiquette pour le moment : ajoute-en depuis le détail d’un élément.')}</Text>}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

/* ---------- Ligne d'élément ---------- */

type Anchor = { x: number; y: number } | null;
type Rect = { x: number; y: number; width: number; height: number };

/** Rectangle d'une vue à l'écran (web : getBoundingClientRect, natif : measureInWindow). */
function measure(node: any, cb: (r: Rect) => void) {
  if (!node) return;
  if (typeof node.getBoundingClientRect === 'function') {
    const r = node.getBoundingClientRect();
    cb({ x: r.left, y: r.top, width: r.width, height: r.height });
  } else node.measureInWindow?.((x: number, y: number, width: number, height: number) => cb({ x, y, width, height }));
}

/** Délai avant l'aperçu au survol. */
const HOVER_DELAY = 900;

function ItemRow({
  item,
  folder,
  highlight,
  selecting,
  selected,
  onPress,
  onMenu,
  onToggle,
  onHover,
}: {
  item: LibraryItem;
  folder?: Folder;
  highlight: boolean;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  /** Menu contextuel : position du pointeur (clic droit) ou null (appui long, bouton ⋯). */
  onMenu: (anchor: Anchor) => void;
  onToggle: () => void;
  /** Aperçu au survol (web) : rectangle de la ligne, ou null quand le pointeur s'en va. */
  onHover: (rect: Rect | null) => void;
}) {
  const { theme: t } = useSettings();
  const ref = useRef<View>(null);
  const more = useRef<View>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef(onMenu);
  menuRef.current = onMenu;
  const clearHover = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearHover, []);
  // Clic droit (Desktop / navigateur) : menu contextuel à l'emplacement du pointeur.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node: any = ref.current;
    if (!node?.addEventListener) return;
    const h = (e: MouseEvent) => {
      e.preventDefault();
      clearHover();
      menuRef.current({ x: e.clientX, y: e.clientY });
    };
    node.addEventListener('contextmenu', h);
    return () => node.removeEventListener('contextmenu', h);
  }, []);
  const meta = [
    plural(item.stats.messages, '{n} message', '{n} messages'),
    item.stats.embeds ? plural(item.stats.embeds, '{n} embed', '{n} embeds') : null,
    item.kind === 'backup' && item.targets ? plural(item.targets, '{n} webhook', '{n} webhooks') : null,
  ].filter(Boolean);
  return (
    <Pressable
      ref={ref}
      onPress={() => {
        clearHover();
        onHover(null);
        if (selecting) onToggle();
        else onPress();
      }}
      onLongPress={() => {
        clearHover();
        onHover(null);
        if (selecting) onToggle();
        else onMenu(null);
      }}
      delayLongPress={380}
      onHoverIn={() => {
        if (selecting) return;
        clearHover();
        timer.current = setTimeout(() => measure(ref.current, (r) => onHover(r)), HOVER_DELAY);
      }}
      onHoverOut={() => {
        clearHover();
        onHover(null);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: selecting ? selected : undefined }}
      accessibilityLabel={item.name}
      accessibilityHint={tr('Appui long ou clic droit : plus d’actions')}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: t.z(10),
        paddingLeft: t.z(12),
        paddingRight: t.z(4),
        borderRadius: t.radius,
        backgroundColor: selected ? t.accentSoft : pressed || hovered ? t.surface2 : t.surface,
        borderWidth: 1,
        borderColor: selected || highlight ? t.accent : t.border,
      })}
    >
      {selecting && <Check on={selected} />}
      <View style={{ width: t.z(40), height: t.z(40), borderRadius: t.radiusSm, backgroundColor: item.kind === 'template' ? t.accentSoft : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={item.icon as IconName} size={t.z(20)} color={item.kind === 'template' ? t.accent : t.textMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {item.pinned && <MaterialCommunityIcons name="pin" size={t.z(14)} color={t.accent} />}
          <Text numberOfLines={1} style={{ flexShrink: 1, color: t.text, fontWeight: '800', fontSize: t.font(15) }}>
            {item.name}
          </Text>
        </View>
        <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>
          {[...meta, item.builtin ? null : fmtDate(item.updatedAt, false)].filter(Boolean).join(' · ')}
        </Text>
        {!!(item.excerpt || item.description) && (
          <Text numberOfLines={1} style={{ color: t.textFaint, fontSize: t.font(12) }}>
            {item.description || item.excerpt}
          </Text>
        )}
        {(folder || item.tags.length > 0) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 3 }}>
            {folder && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, borderWidth: 1, borderColor: t.border }}>
                <FolderDot color={folder.color} size={8} />
                <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(11), fontWeight: '600' }}>{folder.name}</Text>
              </View>
            )}
            {item.tags.slice(0, 4).map((tag) => (
              <TagPill key={tag} tag={tag} small />
            ))}
            {item.tags.length > 4 && <Text style={{ color: t.textFaint, fontSize: t.font(11) }}>+{item.tags.length - 4}</Text>}
          </View>
        )}
      </View>
      {!selecting && (
        <Pressable
          ref={more}
          onPress={() => {
            clearHover();
            onHover(null);
            measure(more.current, (r) => onMenu({ x: r.x + r.width, y: r.y + r.height }));
          }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={tr('Actions pour {name}', { name: item.name })}
          style={({ pressed, hovered }: any) => ({ width: t.z(34), height: t.z(34), borderRadius: t.z(12), alignItems: 'center', justifyContent: 'center', backgroundColor: pressed || hovered ? t.accentSoft : 'transparent' })}
        >
          <MaterialCommunityIcons name="dots-vertical" size={t.z(20)} color={t.textMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}

/** En-tête de section de la liste (Sauvegardes, Mes modèles, Modèles intégrés). */
function SectionHeader({ icon, label, count }: { icon: McIcon; label: string; count: number }) {
  const { theme: t } = useSettings();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 2, paddingHorizontal: 2 }}>
      <MaterialCommunityIcons name={icon} size={t.z(16)} color={t.textFaint} />
      <Text style={{ color: t.textFaint, fontSize: t.font(11), fontWeight: '800', letterSpacing: 0.8 }}>{tr(label).toUpperCase()}</Text>
      <Text style={{ color: t.textFaint, fontSize: t.font(11), fontWeight: '700' }}>{count}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: t.border, marginLeft: 4 }} />
    </View>
  );
}

/* ---------- Dialogues ---------- */

/** Nouveau dossier ou renommage (nom + couleur). */
function FolderDialog({ visible, initial, onClose, onSave }: { visible: boolean; initial?: Folder | null; onClose: () => void; onSave: (name: string, color: string) => void }) {
  const { theme: t } = useSettings();
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]);
  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? FOLDER_COLORS[0]);
    }
  }, [visible, initial]);
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={initial ? 'Modifier le dossier' : 'Nouveau dossier'}
      icon="folder-outline"
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button flex label="Annuler" onPress={onClose} />
          <Button flex variant="primary" icon="checkmark" label={initial ? 'Enregistrer' : 'Créer'} disabled={!name.trim()} onPress={() => onSave(name.trim(), color)} />
        </View>
      }
    >
      <Input label="Nom" value={name} onChangeText={setName} placeholder="Ex : Annonces" max={40} autoFocus />
      <Text style={{ color: t.textMuted, fontSize: t.font(13), fontWeight: '700' }}>{tr('Couleur')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {FOLDER_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="button" accessibilityState={{ selected: color === c }} accessibilityLabel={c} style={{ width: t.z(34), height: t.z(34), borderRadius: 999, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: color === c ? t.text : 'transparent' }}>
            {color === c && <Ionicons name="checkmark" size={t.z(18)} color="#fff" />}
          </Pressable>
        ))}
      </View>
    </Dialog>
  );
}

/** Choix d'un dossier pour un ou plusieurs éléments. */
function MoveDialog({ visible, count, folders, onClose, onPick, onNew }: { visible: boolean; count: number; folders: Folder[]; onClose: () => void; onPick: (id: string | null) => void; onNew: () => void }) {
  return (
    <Dialog visible={visible} onClose={onClose} title={count > 1 ? tr('Déplacer {n} éléments', { n: count }) : 'Déplacer vers un dossier'} icon="folder-open-outline">
      <View style={{ gap: 2 }}>
        <NavRow icon="file-tray-outline" label={tr('Non classé')} onPress={() => onPick(null)} />
        {folders.map((f) => (
          <NavRow key={f.id} color={f.color} label={f.name} onPress={() => onPick(f.id)} />
        ))}
      </View>
      <Button icon="add" label="Nouveau dossier" onPress={onNew} />
    </Dialog>
  );
}

/** Ajout d'une étiquette (suggestions parmi les étiquettes existantes). */
function TagDialog({ visible, count, existing, onClose, onAdd }: { visible: boolean; count: number; existing: string[]; onClose: () => void; onAdd: (tag: string) => void }) {
  const { theme: t } = useSettings();
  const [tag, setTag] = useState('');
  useEffect(() => {
    if (visible) setTag('');
  }, [visible]);
  const clean = cleanTag(tag);
  const suggestions = existing.filter((x) => !clean || x.toLowerCase().includes(clean.toLowerCase())).slice(0, 12);
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={count > 1 ? tr('Étiqueter {n} éléments', { n: count }) : 'Ajouter une étiquette'}
      icon="pricetag-outline"
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button flex label="Annuler" onPress={onClose} />
          <Button flex variant="primary" icon="add" label="Ajouter" disabled={!clean} onPress={() => onAdd(clean)} />
        </View>
      }
    >
      <Input label="Étiquette" value={tag} onChangeText={setTag} placeholder="Ex : règlement" max={32} autoFocus onSubmitEditing={() => clean && onAdd(clean)} />
      {suggestions.length > 0 && (
        <>
          <Text style={{ color: t.textMuted, fontSize: t.font(12), fontWeight: '700' }}>{tr('Étiquettes existantes')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {suggestions.map((s) => (
              <Chip key={s} label={`#${s}`} onPress={() => onAdd(s)} />
            ))}
          </View>
        </>
      )}
    </Dialog>
  );
}

/** Enregistrer le brouillon : en sauvegarde ou en modèle, avec dossier et étiquettes. */
function SaveDraftDialog({
  visible,
  onClose,
  folders,
  tags,
  defaultFolder,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  folders: Folder[];
  tags: string[];
  defaultFolder: string | null;
  onSaved: (key: string) => void;
}) {
  const { theme: t } = useSettings();
  const { state, saveBackup } = useEditor();
  const { saveTemplate } = useLibrary();
  const toast = useToast();
  const [kind, setKind] = useState<'backup' | 'template'>('backup');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [icon, setIcon] = useState<IconName>(TEMPLATE_ICONS[0]);
  const [folder, setFolder] = useState<string>('none');
  const [itemTags, setItemTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  useEffect(() => {
    if (visible) {
      setName('');
      setDesc('');
      setItemTags([]);
      setTagInput('');
      setFolder(defaultFolder && defaultFolder !== 'none' ? defaultFolder : 'none');
    }
  }, [visible, defaultFolder]);
  const addTag = (s: string) => {
    const c = cleanTag(s);
    if (c && !itemTags.includes(c)) setItemTags([...itemTags, c]);
    setTagInput('');
  };
  const save = () => {
    const meta = { folder: folder === 'none' ? null : folder, tags: [...itemTags, ...(cleanTag(tagInput) ? [cleanTag(tagInput)] : [])] };
    if (kind === 'backup') {
      const id = saveBackup(name, meta);
      toast('Brouillon sauvegardé.', 'success');
      onSaved(`backup:${id}`);
    } else {
      const id = saveTemplate(name, desc.trim(), icon, state.messages, meta);
      toast('Modèle enregistré.', 'success');
      onSaved(`template:${id}`);
    }
    onClose();
  };
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title="Enregistrer le brouillon"
      icon="save-outline"
      maxWidth={560}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button flex label="Annuler" onPress={onClose} />
          <Button flex variant="primary" icon="save" label="Enregistrer" disabled={kind === 'template' && !name.trim()} onPress={save} />
        </View>
      }
    >
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'backup', label: 'Sauvegarde', icon: 'archive-outline' },
          { value: 'template', label: 'Modèle', icon: 'bookmark-outline' },
        ]}
      />
      <Text style={{ color: t.textFaint, fontSize: t.font(12), lineHeight: t.font(17) }}>
        {kind === 'backup'
          ? tr('Une sauvegarde garde tout le brouillon : {n} message(s) et les destinations (webhooks).', { n: state.messages.length })
          : tr('Un modèle garde les {n} message(s) sans les destinations ni les fichiers : idéal pour réutiliser une mise en forme.', { n: state.messages.length })}
      </Text>
      <Input label="Nom" value={name} onChangeText={setName} placeholder={kind === 'backup' ? 'Ex : Règlement du serveur' : 'Ex : Annonce de mise à jour'} max={60} autoFocus />
      {kind === 'template' && (
        <>
          <Input label="Description" value={desc} onChangeText={setDesc} max={100} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TEMPLATE_ICONS.map((i) => (
              <Chip key={i} label="" icon={i} selected={icon === i} onPress={() => setIcon(i)} />
            ))}
          </View>
        </>
      )}
      <Dropdown
        label="Dossier"
        title="Dossier"
        value={folder}
        onChange={setFolder}
        searchable={folders.length > 8}
        options={[{ value: 'none', label: tr('Non classé') }, ...folders.map((f) => ({ value: f.id, label: f.name, left: <FolderDot color={f.color} /> }))]}
      />
      <Input label="Étiquettes" value={tagInput} onChangeText={setTagInput} placeholder="Ajouter une étiquette puis Entrée" max={32} onSubmitEditing={() => addTag(tagInput)} blurOnSubmit={false} />
      {(itemTags.length > 0 || tags.length > 0) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {itemTags.map((x) => (
            <TagPill key={x} tag={x} onRemove={() => setItemTags(itemTags.filter((y) => y !== x))} />
          ))}
          {tags
            .filter((x) => !itemTags.includes(x))
            .slice(0, 8)
            .map((x) => (
              <Chip key={x} label={`+ #${x}`} onPress={() => addTag(x)} />
            ))}
        </View>
      )}
    </Dialog>
  );
}

/* ---------- Aperçu : info-bulle (survol) et fenêtre ---------- */

/** En-tête d'un élément : icône, nom, type, chiffres et dates. */
function ItemSummary({ item, folder }: { item: LibraryItem; folder?: Folder }) {
  const { theme: t } = useSettings();
  const facts = [
    plural(item.stats.messages, '{n} message', '{n} messages'),
    item.stats.embeds ? plural(item.stats.embeds, '{n} embed', '{n} embeds') : null,
    item.kind === 'backup' && item.targets ? plural(item.targets, '{n} webhook', '{n} webhooks') : null,
    item.stats.files ? plural(item.stats.files, '{n} fichier', '{n} fichiers') : null,
  ].filter(Boolean);
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: t.z(40), height: t.z(40), borderRadius: t.radiusSm, backgroundColor: item.kind === 'template' ? t.accentSoft : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={item.icon as IconName} size={t.z(20)} color={item.kind === 'template' ? t.accent : t.textMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text numberOfLines={2} style={{ flexShrink: 1, color: t.text, fontSize: t.font(16), fontWeight: '900' }}>
            {item.name}
          </Text>
          <Badge text={item.kind === 'backup' ? tr('Sauvegarde') : item.builtin ? tr('Modèle intégré') : tr('Modèle')} color={item.kind === 'template' ? t.accent : undefined} />
        </View>
        {!!item.description && <Text style={{ color: t.textMuted, fontSize: t.font(12) }}>{item.description}</Text>}
        <Text style={{ color: t.textMuted, fontSize: t.font(12) }}>
          {[...facts, folder?.name].filter(Boolean).join(' · ')}
        </Text>
        {!item.builtin && (
          <Text style={{ color: t.textFaint, fontSize: t.font(11) }}>
            {tr('Créé le {d}', { d: fmtDate(item.createdAt) })} · {tr('modifié le {d}', { d: fmtDate(item.updatedAt) })}
          </Text>
        )}
      </View>
    </View>
  );
}

function PreviewBody({ item }: { item: LibraryItem }) {
  const { theme: t, base } = useSettings();
  return (
    <View style={{ borderRadius: t.radius, backgroundColor: base.preview, borderWidth: 1, borderColor: t.border, padding: 10, gap: 10 }}>
      {item.messages.length ? <PreviewList messages={item.messages} /> : <Text style={{ color: t.textFaint }}>{tr('Aucun message.')}</Text>}
    </View>
  );
}

/** Info-bulle d'aperçu, à côté de la ligne survolée (n'intercepte pas le pointeur). */
function HoverPreview({ item, folder, rect }: { item: LibraryItem; folder?: Folder; rect: Rect }) {
  const { theme: t, base } = useSettings();
  const { width: W, height: H } = useWindowDimensions();
  const w = Math.min(440, W - 24);
  const right = rect.x + rect.width + 12;
  const left = right + w <= W - 12 ? right : rect.x - w - 12 >= 12 ? rect.x - w - 12 : Math.max(12, Math.min(rect.x, W - w - 12));
  const below = left !== right && left !== rect.x - w - 12;
  const maxH = Math.min(520, H - 24);
  const top = below ? Math.min(rect.y + rect.height + 8, H - 160) : Math.max(12, Math.min(rect.y - 8, H - maxH - 12));
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 140, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [fade]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width: w,
        maxHeight: maxH,
        overflow: 'hidden',
        padding: 12,
        gap: 10,
        borderRadius: t.radius + 2,
        backgroundColor: base.bgAlt,
        borderWidth: 1,
        borderColor: t.border,
        opacity: fade,
        elevation: 18,
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        zIndex: 50,
      }}
    >
      <ItemSummary item={item} folder={folder} />
      <PreviewBody item={item} />
    </Animated.View>
  );
}

/** Fenêtre d'aperçu (clic sur un élément, ou « Aperçu » du menu). */
function PreviewDialog({ item, folder, onClose, onOpen, onAppend, onMore }: { item: LibraryItem | null; folder?: Folder; onClose: () => void; onOpen: () => void; onAppend: () => void; onMore: () => void }) {
  const { height, width } = useWindowDimensions();
  const narrow = width < 560;
  return (
    <Dialog
      visible={!!item}
      onClose={onClose}
      title="Aperçu"
      icon="eye-outline"
      maxWidth={620}
      footer={
        narrow ? (
          <View style={{ gap: 8 }}>
            <Button variant="primary" icon="open-outline" label="Ouvrir dans l’éditeur" onPress={onOpen} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button flex icon="add" label="Ajouter au brouillon" onPress={onAppend} />
              <Button icon="ellipsis-horizontal" label="Plus" onPress={onMore} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button flex variant="primary" icon="open-outline" label="Ouvrir dans l’éditeur" onPress={onOpen} />
            <Button flex icon="add" label="Ajouter au brouillon" onPress={onAppend} />
            <Button icon="ellipsis-horizontal" label="Plus" onPress={onMore} />
          </View>
        )
      }
    >
      {item && (
        <ScrollView style={{ maxHeight: Math.max(240, height * 0.55) }} contentContainerStyle={{ gap: 12 }}>
          <ItemSummary item={item} folder={folder} />
          <PreviewBody item={item} />
        </ScrollView>
      )}
    </Dialog>
  );
}

/* ---------- Menu contextuel ---------- */

type MenuEntry = { key: string; label: string; icon: McIcon; danger?: boolean; onPress: () => void } | { key: string; sep: true };

/**
 * Menu contextuel : à l'emplacement du pointeur (clic droit, bouton ⋯) ou, sans position
 * (appui long sur téléphone), en panneau ancré en bas de l'écran avec un titre.
 */
function ContextMenu({ visible, anchor, title, subtitle, entries, onClose }: { visible: boolean; anchor: Anchor; title?: string; subtitle?: string; entries: MenuEntry[]; onClose: () => void }) {
  const { theme: t, base, haptic } = useSettings();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const sheet = !anchor;
  const w = sheet ? Math.min(W - 16, 520) : 260;
  const rowH = t.z(40);
  const estH = entries.reduce((n, e) => n + ('sep' in e ? 9 : rowH), 16) + (title ? 30 : 0);
  const maxH = H - insets.top - insets.bottom - 24;
  const left = sheet ? (W - w) / 2 : Math.max(8, Math.min(anchor!.x, W - w - 8));
  const top = sheet ? undefined : Math.max(insets.top + 8, Math.min(anchor!.y, H - Math.min(estH, maxH) - 8));
  useEffect(() => {
    if (visible) haptic('light');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: sheet ? 'rgba(0,0,0,0.45)' : 'transparent' }} onPress={onClose} accessibilityLabel={tr('Fermer')} />
      <View
        accessibilityViewIsModal
        style={{
          position: 'absolute',
          left,
          width: w,
          ...(sheet ? { bottom: insets.bottom + 8 } : { top }),
          maxHeight: maxH,
          padding: 6,
          borderRadius: t.radius + 4,
          backgroundColor: base.bgAlt,
          borderWidth: 1,
          borderColor: t.border,
          elevation: 18,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        {!!title && (
          <View style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '900', fontSize: t.font(sheet ? 15 : 13) }}>{title}</Text>
            {!!subtitle && <Text numberOfLines={1} style={{ color: t.textFaint, fontSize: t.font(11) }}>{subtitle}</Text>}
          </View>
        )}
        <ScrollView style={{ flexGrow: 0 }} bounces={false}>
          {entries.map((e) =>
            'sep' in e ? (
              <View key={e.key} style={{ height: 1, backgroundColor: t.border, marginVertical: 4, marginHorizontal: 8 }} />
            ) : (
              <Pressable
                key={e.key}
                onPress={() => {
                  onClose();
                  setTimeout(e.onPress, 0);
                }}
                accessibilityRole="menuitem"
                accessibilityLabel={e.label}
                style={({ pressed, hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, height: rowH, paddingHorizontal: 10, borderRadius: t.radiusSm, backgroundColor: pressed || hovered ? (e.danger ? 'rgba(237,66,69,0.14)' : t.accentSoft) : 'transparent' })}
              >
                <MaterialCommunityIcons name={e.icon} size={t.z(19)} color={e.danger ? t.danger : t.textMuted} />
                <Text numberOfLines={1} style={{ flex: 1, color: e.danger ? t.danger : t.text, fontSize: t.font(14), fontWeight: '600' }}>{e.label}</Text>
              </Pressable>
            ),
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Renommer un élément (et la description d'un modèle). */
function RenameDialog({ item, onClose, onSave }: { item: LibraryItem | null; onClose: () => void; onSave: (name: string, description: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(() => {
    if (item) {
      setName(item.name);
      setDesc(item.description);
    }
  }, [item]);
  return (
    <Dialog
      visible={!!item}
      onClose={onClose}
      title="Renommer"
      icon="pencil-outline"
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button flex label="Annuler" onPress={onClose} />
          <Button flex variant="primary" icon="checkmark" label="Enregistrer" disabled={!name.trim()} onPress={() => onSave(name.trim(), desc.trim())} />
        </View>
      }
    >
      <Input label="Nom" value={name} onChangeText={setName} max={60} autoFocus onSubmitEditing={() => name.trim() && onSave(name.trim(), desc.trim())} />
      {item?.kind === 'template' && <Input label="Description" value={desc} onChangeText={setDesc} max={100} />}
    </Dialog>
  );
}

/** Étiquettes d'un élément : retirer, ajouter (suggestions parmi les étiquettes existantes). */
function ItemTagsDialog({ item, existing, onClose, onChange }: { item: LibraryItem | null; existing: string[]; onClose: () => void; onChange: (tags: string[]) => void }) {
  const { theme: t } = useSettings();
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState('');
  useEffect(() => {
    if (item) {
      setTags(item.tags);
      setInput('');
    }
  }, [item]);
  const add = (s: string) => {
    const c = cleanTag(s);
    if (c && !tags.includes(c)) setTags([...tags, c]);
    setInput('');
  };
  const pending = cleanTag(input);
  return (
    <Dialog
      visible={!!item}
      onClose={onClose}
      title="Étiquettes"
      icon="pricetag-outline"
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button flex label="Annuler" onPress={onClose} />
          <Button flex variant="primary" icon="checkmark" label="Enregistrer" onPress={() => onChange(pending && !tags.includes(pending) ? [...tags, pending] : tags)} />
        </View>
      }
    >
      <Input label="Ajouter une étiquette" value={input} onChangeText={setInput} placeholder="Ajouter une étiquette puis Entrée" max={32} autoFocus onSubmitEditing={() => add(input)} blurOnSubmit={false} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {tags.map((x) => (
          <TagPill key={x} tag={x} onRemove={() => setTags(tags.filter((y) => y !== x))} />
        ))}
        {!tags.length && <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr('Aucune étiquette.')}</Text>}
      </View>
      {existing.filter((x) => !tags.includes(x)).length > 0 && (
        <>
          <Text style={{ color: t.textMuted, fontSize: t.font(12), fontWeight: '700' }}>{tr('Étiquettes existantes')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {existing
              .filter((x) => !tags.includes(x))
              .slice(0, 16)
              .map((x) => (
                <Chip key={x} label={`+ #${x}`} onPress={() => add(x)} />
              ))}
          </View>
        </>
      )}
    </Dialog>
  );
}

/* ---------- Page ---------- */

export function DataScreen({
  visible,
  onClose,
  onRestored,
  onOpenEditor,
  initialSection = 'library',
}: {
  visible: boolean;
  onClose: () => void;
  onRestored: () => void;
  /** Après « Ouvrir dans l'éditeur » : ferme la page et affiche l'éditeur. */
  onOpenEditor: () => void;
  initialSection?: Section;
}) {
  const { theme: t, base, haptic } = useSettings();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toast = useToast();
  const { state, replace, backups, saveBackup, updateBackups, deleteBackups, addBackups } = useEditor();
  const { templates, userTemplates, saveTemplate, updateTemplates, deleteTemplates, addTemplates, folders, createFolder, updateFolder, deleteFolder, addFolders, automations } = useLibrary();

  const wide = width >= 1000;
  const medium = width >= 720;
  const [section, setSection] = useState<Section>(initialSection);
  const [filters, setFilters] = useState<Filters>({ scope: 'all', folder: null, tag: null, query: '', sort: 'updated' });
  const setF = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));
  // Élément mis en évidence (dernier créé / dupliqué / importé), quelques secondes.
  const [highlight, setHighlight] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [dialog, setDialog] = useState<null | 'save' | 'folder' | 'move' | 'tag' | 'sort'>(null);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const afterFolder = useRef<((id: string) => void) | null>(null);
  const [schedule, setSchedule] = useState<string | null>(null);
  const [autoTab, setAutoTab] = useState<'scheduled' | 'bot'>('scheduled');
  const { systems: botSystems } = useBotSystems();
  // Menu contextuel, aperçu (fenêtre et info-bulle), renommage, étiquettes, cible des dialogues.
  const [menu, setMenu] = useState<{ key: string; anchor: Anchor } | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [hover, setHover] = useState<{ key: string; rect: Rect } | null>(null);
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [tagsKey, setTagsKey] = useState<string | null>(null);
  const [targets, setTargets] = useState<string[] | null>(null);

  const items = useMemo(() => buildItems(backups, templates), [backups, templates]);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const tagList = useMemo(() => allTags(items), [items]);
  const visibleItems = useMemo(() => filterItems(items, filters, folders), [items, filters, folders]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const folderOf = (i: LibraryItem) => (i.folder ? folderById.get(i.folder) : undefined);
  const folderCount = (id: string | null) => items.filter((i) => (id === null ? !i.builtin && (!i.folder || !folderById.has(i.folder)) : i.folder === id)).length;
  const menuItem = menu ? byKey.get(menu.key) ?? null : null;
  const previewItem = previewKey ? byKey.get(previewKey) ?? null : null;
  const hoverItem = hover ? byKey.get(hover.key) ?? null : null;

  useEffect(() => {
    if (!highlight) return;
    const id = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(id);
  }, [highlight]);
  // La sélection ne garde que les éléments encore présents.
  useEffect(() => {
    setSelected((s) => {
      const keys = new Set(items.map((i) => i.key));
      const next = new Set([...s].filter((k) => keys.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [items]);
  // Pas d'info-bulle qui traîne quand on change de vue.
  useEffect(() => setHover(null), [section, filters, selecting]);

  const selItems = items.filter((i) => selected.has(i.key));
  const selEditable = selItems.filter((i) => !i.builtin);
  /** Éléments visés par « Déplacer » / « Étiqueter » : un élément du menu, ou la sélection. */
  const targetItems = targets ? (targets.map((k) => byKey.get(k)).filter((i) => i && !i.builtin) as LibraryItem[]) : selEditable;
  const toggleSel = (key: string) => {
    haptic('light');
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };
  const endSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.key));

  /** Applique une modification aux éléments donnés (sauvegardes et modèles personnels). */
  const patchItems = (list: LibraryItem[], patch: (i: LibraryItem) => Partial<Backup & Template>) => {
    const b = list.filter((i) => i.kind === 'backup');
    const tp = list.filter((i) => i.kind === 'template' && !i.builtin);
    const map = new Map(list.map((i) => [i.key, i]));
    if (b.length) updateBackups(b.map((i) => i.id), (x) => patch(map.get(`backup:${x.id}`)!));
    if (tp.length) updateTemplates(tp.map((i) => i.id), (x) => patch(map.get(`template:${x.id}`)!));
  };

  const openFolderDialog = (f: Folder | null, then?: (id: string) => void) => {
    setEditFolder(f);
    afterFolder.current = then ?? null;
    setDialog('folder');
  };

  /* ----- Actions sur un élément ----- */
  const loadItem = (item: LibraryItem) =>
    Alert.alert(tr('Ouvrir « {name} » ?', { name: item.name }), item.kind === 'backup' ? tr('Le brouillon actuel sera remplacé (messages et destinations).') : tr('Les messages du brouillon seront remplacés ; les destinations sont conservées.'), [
      { text: tr('Annuler'), style: 'cancel' },
      {
        text: tr('Ouvrir'),
        onPress: () => {
          if (item.kind === 'backup') {
            const b = backups.find((x) => x.id === item.id);
            if (b) replace(JSON.parse(JSON.stringify(b.state)));
          } else replace({ ...state, messages: item.messages.map(cloneMessage) });
          setPreviewKey(null);
          toast(tr('« {name} » ouvert dans l’éditeur.', { name: item.name }), 'success');
          onOpenEditor();
        },
      },
    ]);
  const appendItem = (item: LibraryItem) => {
    replace({ ...state, messages: [...state.messages, ...item.messages.map(cloneMessage)] });
    toast(plural(item.messages.length, '{n} message ajouté au brouillon.', '{n} messages ajoutés au brouillon.'), 'success');
  };
  const duplicateItem = (item: LibraryItem) => {
    const name = tr('{name} (copie)', { name: item.name });
    const meta = { folder: item.folder, tags: item.tags };
    let key: string;
    if (item.kind === 'backup') {
      const b = backups.find((x) => x.id === item.id);
      if (!b) return;
      key = `backup:${saveBackup(name, { ...meta, state: b.state })}`;
    } else key = `template:${saveTemplate(name, item.description, item.icon, item.messages, meta)}`;
    setHighlight(key);
    toast('Élément dupliqué.', 'success');
  };
  const convertItem = (item: LibraryItem) => {
    const meta = { folder: item.folder, tags: item.tags };
    let key: string;
    if (item.kind === 'backup') key = `template:${saveTemplate(item.name, '', 'document-text-outline', item.messages, meta)}`;
    else key = `backup:${saveBackup(item.name, { ...meta, state: { targets: state.targets, messages: item.messages.map(cloneMessage) } })}`;
    setHighlight(key);
    toast(item.kind === 'backup' ? 'Modèle créé à partir de la sauvegarde.' : 'Sauvegarde créée à partir du modèle (avec les destinations actuelles).', 'success');
  };
  const scheduleItem = (item: LibraryItem) => {
    setSchedule(`${item.kind}:${item.id}`);
    setAutoTab('scheduled');
    setSection('automations');
  };
  const overwriteItem = (item: LibraryItem) =>
    Alert.alert(tr('Remplacer le contenu de « {name} » ?', { name: item.name }), tr('La sauvegarde prendra le contenu actuel du brouillon ({n} message(s) et ses destinations).', { n: state.messages.length }), [
      { text: tr('Annuler'), style: 'cancel' },
      {
        text: tr('Remplacer'),
        onPress: () => {
          if (item.kind === 'backup') updateBackups([item.id], () => ({ state: JSON.parse(JSON.stringify(state)) }));
          else updateTemplates([item.id], () => ({ messages: state.messages.map((m) => ({ ...cloneMessage(m), attachments: [] })) }));
          toast('Contenu mis à jour avec le brouillon.', 'success');
        },
      },
    ]);
  const removeItem = (item: LibraryItem) =>
    Alert.alert(tr('Supprimer « {name} » ?', { name: item.name }), tr('Cette action est définitive (sur tous les appareils liés).'), [
      { text: tr('Annuler'), style: 'cancel' },
      {
        text: tr('Supprimer'),
        style: 'destructive',
        onPress: () => {
          if (item.kind === 'backup') deleteBackups([item.id]);
          else deleteTemplates([item.id]);
          setPreviewKey(null);
          toast('Élément supprimé.', 'success');
        },
      },
    ]);
  const exportOne = async (item: LibraryItem) => {
    const src = item.kind === 'backup' ? backups.find((b) => b.id === item.id)?.state : { targets: [], messages: item.messages };
    if (!src) return;
    try {
      const r = await shareTextFile(`${item.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'fluxerhooks'}.json`, exportState(src, false), tr('Exporter le JSON'));
      if (r === 'unavailable') toast('Partage indisponible sur cet appareil.', 'error');
      else if (r === 'saved') toast('Fichier enregistré.', 'success');
    } catch {
      toast('Échec de l’export.', 'error');
    }
  };

  /** Entrées du menu contextuel d'un élément. */
  const menuEntries = (item: LibraryItem): MenuEntry[] => {
    const editable = !item.builtin;
    const list: (MenuEntry | false)[] = [
      { key: 'preview', label: tr('Aperçu'), icon: 'eye-outline', onPress: () => setPreviewKey(item.key) },
      { key: 'open', label: tr('Ouvrir dans l’éditeur'), icon: 'open-in-app', onPress: () => loadItem(item) },
      { key: 'append', label: tr('Ajouter au brouillon'), icon: 'playlist-plus', onPress: () => appendItem(item) },
      { key: 's1', sep: true },
      editable && { key: 'rename', label: tr('Renommer'), icon: 'pencil-outline', onPress: () => setRenameKey(item.key) },
      editable && { key: 'pin', label: tr(item.pinned ? 'Désépingler' : 'Épingler'), icon: item.pinned ? 'pin-off-outline' : 'pin-outline', onPress: () => patchItems([item], () => ({ pinned: !item.pinned })) },
      editable && {
        key: 'move',
        label: tr('Déplacer vers un dossier…'),
        icon: 'folder-move-outline',
        onPress: () => {
          setTargets([item.key]);
          setDialog('move');
        },
      },
      editable && { key: 'tags', label: tr('Étiquettes…'), icon: 'tag-outline', onPress: () => setTagsKey(item.key) },
      editable && { key: 's2', sep: true },
      { key: 'dup', label: tr('Dupliquer'), icon: 'content-copy', onPress: () => duplicateItem(item) },
      { key: 'convert', label: tr(item.kind === 'backup' ? 'Enregistrer comme modèle' : 'Enregistrer comme sauvegarde'), icon: item.kind === 'backup' ? 'bookmark-outline' : 'archive-outline', onPress: () => convertItem(item) },
      editable && { key: 'overwrite', label: tr('Remplacer par le brouillon'), icon: 'file-replace-outline', onPress: () => overwriteItem(item) },
      { key: 'schedule', label: tr('Programmer un envoi'), icon: 'timer-outline', onPress: () => scheduleItem(item) },
      { key: 'export', label: tr('Exporter le JSON'), icon: 'export-variant', onPress: () => exportOne(item) },
      { key: 's3', sep: true },
      {
        key: 'select',
        label: tr('Sélectionner'),
        icon: 'checkbox-marked-outline',
        onPress: () => {
          setSelecting(true);
          setSelected(new Set([item.key]));
        },
      },
      editable && { key: 'delete', label: tr('Supprimer'), icon: 'trash-can-outline', danger: true, onPress: () => removeItem(item) },
    ];
    return list.filter(Boolean) as MenuEntry[];
  };

  /* ----- Actions groupées ----- */
  const bulkDelete = () => {
    if (!selEditable.length) return toast('Les modèles intégrés ne peuvent pas être supprimés.', 'error');
    Alert.alert(plural(selEditable.length, 'Supprimer {n} élément ?', 'Supprimer {n} éléments ?'), tr('Cette action est définitive (sur tous les appareils liés).'), [
      { text: tr('Annuler'), style: 'cancel' },
      {
        text: tr('Supprimer'),
        style: 'destructive',
        onPress: () => {
          const b = selEditable.filter((i) => i.kind === 'backup').map((i) => i.id);
          const tp = selEditable.filter((i) => i.kind === 'template').map((i) => i.id);
          if (b.length) deleteBackups(b);
          if (tp.length) deleteTemplates(tp);
          toast(plural(selEditable.length, '{n} élément supprimé.', '{n} éléments supprimés.'), 'success');
          endSelection();
        },
      },
    ]);
  };
  const bulkPin = () => {
    const pin = selEditable.some((i) => !i.pinned);
    patchItems(selEditable, () => ({ pinned: pin }));
    toast(pin ? 'Éléments épinglés.' : 'Éléments désépinglés.', 'success');
  };
  const exportItems = async (list: LibraryItem[], all = false) => {
    const b = all ? backups : backups.filter((x) => list.some((i) => i.kind === 'backup' && i.id === x.id));
    const tp = all ? userTemplates : templates.filter((x) => list.some((i) => i.kind === 'template' && i.id === x.id));
    if (!b.length && !tp.filter((x) => !x.builtin).length) return toast('Rien à exporter (les modèles intégrés ne sont pas exportés).', 'error');
    try {
      const r = await shareTextFile(`fluxerhooks-bibliotheque-${new Date().toISOString().slice(0, 10)}.json`, exportLibrary(b, tp, folders), tr('Exporter la bibliothèque'));
      if (r === 'unavailable') toast('Partage indisponible sur cet appareil.', 'error');
      else if (r === 'saved') toast('Fichier enregistré.', 'success');
    } catch {
      toast('Échec de l’export.', 'error');
    }
  };
  const importFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/*', '*/*'], copyToCacheDirectory: true });
      if (res.canceled) return;
      const a = res.assets[0];
      const r = importLibrary(await readPickedText(a), state, a.name);
      if (r.folders.length) addFolders(r.folders);
      if (r.backups.length) addBackups(r.backups);
      if (r.templates.length) addTemplates(r.templates);
      const n = r.backups.length + r.templates.length;
      toast(plural(n, '{n} élément importé.', '{n} éléments importés.'), 'success');
      setSection('library');
      setF({ scope: 'all', folder: null, tag: null, query: '' });
      setHighlight(r.backups[0] ? `backup:${r.backups[0].id}` : r.templates[0] ? `template:${r.templates[0].id}` : null);
    } catch (e) {
      toast(tr('Import impossible : {e}', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  };

  /* ----- Dossiers et étiquettes ----- */
  const removeFolder = (f: Folder) =>
    Alert.alert(tr('Supprimer le dossier « {name} » ?', { name: f.name }), tr('Les {n} élément(s) qu’il contient ne sont pas supprimés : ils deviennent non classés.', { n: folderCount(f.id) }), [
      { text: tr('Annuler'), style: 'cancel' },
      {
        text: tr('Supprimer'),
        style: 'destructive',
        onPress: () => {
          patchItems(items.filter((i) => i.folder === f.id), () => ({ folder: null }));
          deleteFolder(f.id);
          setF({ folder: null });
        },
      },
    ]);
  const removeTag = (tag: string) =>
    Alert.alert(tr('Retirer l’étiquette « {tag} » ?', { tag }), tr('Elle sera retirée de tous les éléments ; les éléments sont conservés.'), [
      { text: tr('Annuler'), style: 'cancel' },
      {
        text: tr('Retirer'),
        style: 'destructive',
        onPress: () => {
          patchItems(items.filter((i) => i.tags.includes(tag)), (i) => ({ tags: i.tags.filter((x) => x !== tag) }));
          setF({ tag: null });
        },
      },
    ]);

  /* ----- Rendu ----- */
  const scopeLabel: Record<Scope, string> = { all: 'Tout', backup: 'Sauvegardes', template: 'Modèles', pinned: 'Épinglés' };
  const sortLabel: Record<SortKey, string> = { updated: 'Modifiés récemment', created: 'Créés récemment', name: 'Nom (A → Z)', messages: 'Nombre de messages' };
  const currentFolder = filters.folder && filters.folder !== 'none' ? folderById.get(filters.folder) : undefined;
  const listTitle = currentFolder ? currentFolder.name : filters.folder === 'none' ? tr('Non classés') : tr(scopeLabel[filters.scope]);

  const sidebar = (
    <View style={{ width: wide ? 250 : 220, flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderRightColor: t.border, backgroundColor: base.bgAlt }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 32 }}>
        <GroupLabel>Bibliothèque</GroupLabel>
        {(['all', 'backup', 'template', 'pinned'] as Scope[]).map((s) => (
          <NavRow
            key={s}
            icon={s === 'all' ? 'albums-outline' : s === 'backup' ? 'archive-outline' : s === 'template' ? 'bookmark-outline' : 'pin-outline'}
            label={tr(scopeLabel[s])}
            count={s === 'all' ? items.length : s === 'pinned' ? items.filter((i) => i.pinned).length : items.filter((i) => i.kind === s).length}
            active={section === 'library' && filters.scope === s && !filters.folder}
            onPress={() => {
              setSection('library');
              setF({ scope: s, folder: null });
            }}
          />
        ))}
        <GroupLabel right={<SquareBtn small icon="plus" label="Nouveau dossier" onPress={() => openFolderDialog(null)} />}>Dossiers</GroupLabel>
        <NavRow icon="file-tray-outline" label={tr('Non classés')} count={folderCount(null)} active={section === 'library' && filters.folder === 'none'} onPress={() => { setSection('library'); setF({ folder: 'none', scope: 'all' }); }} />
        {folders.map((f) => (
          <NavRow key={f.id} color={f.color} label={f.name} count={folderCount(f.id)} active={section === 'library' && filters.folder === f.id} onPress={() => { setSection('library'); setF({ folder: f.id, scope: 'all' }); }} />
        ))}
        {!folders.length && (
          <Pressable onPress={() => openFolderDialog(null)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr('Crée des dossiers pour ranger tes messages.')}</Text>
          </Pressable>
        )}
        <GroupLabel>Outils</GroupLabel>
        <NavRow icon="timer-outline" label={tr('Automatisations')} count={automations.length + botSystems.length} active={section === 'automations'} onPress={() => setSection('automations')} />
        <NavRow icon="swap-vertical-outline" label={tr('Transfert et backup')} active={section === 'transfer'} onPress={() => setSection('transfer')} />
      </ScrollView>
    </View>
  );

  // Barre de filtres du téléphone (pas de barre latérale).
  const mobileFilters = (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
        {(['all', 'backup', 'template', 'pinned'] as Scope[]).map((s) => (
          <Chip key={s} label={scopeLabel[s]} selected={filters.scope === s} onPress={() => setF({ scope: s })} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8, alignItems: 'center' }}>
        <Chip label="Tous les dossiers" icon="folder-open-outline" selected={!filters.folder} onPress={() => setF({ folder: null })} />
        <Chip label="Non classés" selected={filters.folder === 'none'} onPress={() => setF({ folder: 'none' })} />
        {folders.map((f) => (
          <Chip key={f.id} label={f.name} color={f.color} selected={filters.folder === f.id} onPress={() => setF({ folder: filters.folder === f.id ? null : f.id })} />
        ))}
        <Chip label="Dossier" icon="add" onPress={() => openFolderDialog(null)} />
      </ScrollView>
    </View>
  );

  const toolbar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {currentFolder && <FolderDot color={currentFolder.color} size={12} />}
      <Text numberOfLines={1} style={{ flexShrink: 1, color: t.text, fontWeight: '900', fontSize: t.font(16) }}>
        {listTitle}
      </Text>
      <Text style={{ color: t.textFaint, fontSize: t.font(13), fontWeight: '700' }}>{visibleItems.length}</Text>
      {currentFolder && (
        <>
          <SquareBtn small icon="pencil-outline" label="Modifier le dossier" onPress={() => openFolderDialog(currentFolder)} />
          <SquareBtn small danger icon="trash-can-outline" label="Supprimer le dossier" onPress={() => removeFolder(currentFolder)} />
        </>
      )}
      <View style={{ flex: 1 }} />
      <TagFilter tags={tagList} value={filters.tag} onChange={(tag) => setF({ tag })} />
      <SquareBtn icon="sort-variant" label={medium ? sortLabel[filters.sort] : tr('Trier : {s}', { s: tr(sortLabel[filters.sort]) })} showLabel={medium} onPress={() => setDialog('sort')} />
      <SquareBtn icon={selecting ? 'close' : 'checkbox-multiple-outline'} label={selecting ? (medium ? 'Terminer' : 'Terminer la sélection') : 'Sélectionner'} showLabel={medium} active={selecting} onPress={() => (selecting ? endSelection() : setSelecting(true))} />
    </View>
  );
  // Étiquette choisie dans le filtre : rappel sous la barre d'outils, pour la retirer ou la supprimer partout.
  const tagBar = filters.tag ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable onPress={() => setF({ tag: null })} accessibilityRole="button" accessibilityLabel={tr('Retirer le filtre #{tag}', { tag: filters.tag })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 8, height: t.z(30), borderRadius: 999, backgroundColor: pressed ? t.accentPressed : t.accent })}>
        <Text style={{ color: t.onAccent, fontWeight: '800', fontSize: t.font(13) }}>#{filters.tag}</Text>
        <MaterialCommunityIcons name="close" size={t.z(15)} color={t.onAccent} />
      </Pressable>
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => removeTag(filters.tag!)} accessibilityRole="button" hitSlop={6}>
        <Text style={{ color: t.danger, fontWeight: '700', fontSize: t.font(12) }}>{tr('Retirer cette étiquette partout')}</Text>
      </Pressable>
    </View>
  ) : null;

  // Sauvegardes, modèles personnels et modèles intégrés : trois sections distinctes.
  const groups = [
    { key: 'backups', label: 'Sauvegardes', icon: 'archive-outline' as McIcon, list: visibleItems.filter((i) => i.kind === 'backup') },
    { key: 'templates', label: 'Mes modèles', icon: 'bookmark-outline' as McIcon, list: visibleItems.filter((i) => i.kind === 'template' && !i.builtin) },
    { key: 'builtin', label: 'Modèles intégrés', icon: 'star-four-points-outline' as McIcon, list: visibleItems.filter((i) => i.builtin) },
  ].filter((g) => g.list.length);
  // Grand écran : plusieurs colonnes de cartes.
  const listW = width - (medium ? (wide ? 250 : 220) : 0) - 28;
  const cols = Math.max(1, Math.min(3, Math.floor(listW / 380)));

  const renderRow = (i: LibraryItem) => (
    <View key={i.key} style={{ width: cols > 1 ? (`${100 / cols}%` as any) : '100%', padding: 4 }}>
      <ItemRow
        item={i}
        folder={folderOf(i)}
        highlight={i.key === highlight}
        selecting={selecting}
        selected={selected.has(i.key)}
        onPress={() => setPreviewKey(i.key)}
        onMenu={(anchor) => setMenu({ key: i.key, anchor })}
        onToggle={() => toggleSel(i.key)}
        onHover={(rect) => setHover(rect ? { key: i.key, rect } : null)}
      />
    </View>
  );

  const list = (
    <ScrollView keyboardShouldPersistTaps="handled" onScroll={() => hover && setHover(null)} scrollEventThrottle={64} contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: selecting ? 120 : insets.bottom + 32 }}>
      {!medium && mobileFilters}
      {toolbar}
      {tagBar}
      {selecting && (
        <Pressable onPress={() => setSelected(allVisibleSelected ? new Set() : new Set([...selected, ...visibleItems.map((i) => i.key)]))} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
          <Check on={allVisibleSelected} />
          <Text style={{ color: t.textMuted, fontWeight: '700', fontSize: t.font(13) }}>{tr(allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner')}</Text>
        </Pressable>
      )}
      {!items.length ? (
        <EmptyState
          icon="archive-outline"
          title="Aucune sauvegarde"
          text="Enregistre le brouillon pour retrouver tes messages, les ranger dans des dossiers, les programmer ou les réutiliser."
          action={<Button variant="primary" icon="save-outline" label="Enregistrer le brouillon" onPress={() => setDialog('save')} />}
        />
      ) : !visibleItems.length ? (
        <EmptyState icon="search-outline" title="Aucun résultat" text={filters.query ? tr('Aucun élément ne correspond à « {q} ».', { q: filters.query }) : 'Aucun élément ici pour le moment.'} />
      ) : (
        groups.map((g) => (
          <View key={g.key}>
            <SectionHeader icon={g.icon} label={g.label} count={g.list.length} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>{g.list.map(renderRow)}</View>
          </View>
        ))
      )}
      {!!items.length && !selecting && Platform.OS === 'web' && (
        <Text style={{ color: t.textFaint, fontSize: t.font(11), textAlign: 'center', marginTop: 8 }}>{tr('Survole un élément pour l’aperçu · clic droit pour les actions')}</Text>
      )}
    </ScrollView>
  );

  const selectionBar = selecting && (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: t.radius + 4,
        backgroundColor: base.bgAlt,
        borderWidth: 1,
        borderColor: t.accent,
        elevation: 12,
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        maxWidth: 720,
        alignSelf: 'center',
      }}
    >
      <Text style={{ flex: 1, color: t.text, fontWeight: '800', fontSize: t.font(14) }}>{plural(selected.size, '{n} sélectionné', '{n} sélectionnés')}</Text>
      <SquareBtn small icon="folder-move-outline" label="Déplacer vers un dossier" disabled={!selEditable.length} onPress={() => { setTargets(null); setDialog('move'); }} />
      <SquareBtn small icon="tag-outline" label="Ajouter une étiquette" disabled={!selEditable.length} onPress={() => { setTargets(null); setDialog('tag'); }} />
      <SquareBtn small icon="pin-outline" label="Épingler / désépingler" disabled={!selEditable.length} onPress={bulkPin} />
      <SquareBtn small icon="export-variant" label="Exporter la sélection" disabled={!selected.size} onPress={() => exportItems(selItems)} />
      <SquareBtn small danger icon="trash-can-outline" label="Supprimer la sélection" disabled={!selEditable.length} onPress={bulkDelete} />
    </View>
  );

  const transfer = (
    <ScrollView contentContainerStyle={{ padding: 16, gap: t.gap, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <Box title="Bibliothèque" icon="library-outline" collapsible={false}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(18) }}>
          {tr('Exporte tes sauvegardes, modèles, dossiers et étiquettes dans un fichier, ou importe un fichier de bibliothèque ou un JSON de message (FluxerHooks, Discohook). Un import ajoute des éléments sans rien remplacer.')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button flex icon="share-outline" label="Exporter la bibliothèque" onPress={() => exportItems(items, true)} />
          <Button flex icon="download-outline" label="Importer un fichier" onPress={importFile} />
        </View>
      </Box>
      <DataTransfer onRestored={() => { onClose(); onRestored(); }} />
    </ScrollView>
  );

  const header = (
    <View style={[{ paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 10, backgroundColor: base.bgAlt, borderBottomWidth: 1, borderBottomColor: t.border, gap: 8 }, t.css.header]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <SquareBtn icon="arrow-left" label="Retour" onPress={onClose} />
        <View style={{ flexShrink: 1, minWidth: 0, marginRight: 4 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontSize: t.font(18), fontWeight: '900' }}>
            {tr('Données')}
          </Text>
          <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(11) }}>
            {plural(backups.length, '{n} sauvegarde', '{n} sauvegardes')} · {plural(userTemplates.length, '{n} modèle', '{n} modèles')} · {plural(folders.length, '{n} dossier', '{n} dossiers')}
          </Text>
        </View>
        {medium && section === 'library' && <SearchField value={filters.query} onChange={(q) => setF({ query: q })} placeholder="Rechercher dans les noms, étiquettes et messages" />}
        {medium && section === 'automations' && <SearchField value={filters.query} onChange={(q) => setF({ query: q })} placeholder="Rechercher une automatisation" />}
        {(!medium || section === 'transfer') && <View style={{ flex: 1 }} />}
        <SquareBtn icon="tray-arrow-down" label="Importer un fichier" onPress={importFile} />
        <SquareBtn primary icon="content-save-outline" label="Enregistrer le brouillon" showLabel={medium} onPress={() => setDialog('save')} />
      </View>
      {!medium && (
        <>
          <Segmented
            value={section}
            onChange={setSection}
            options={[
              { value: 'library', label: 'Bibliothèque' },
              { value: 'automations', label: 'Automatisations' },
              { value: 'transfer', label: 'Transfert' },
            ]}
          />
          {section !== 'transfer' && <SearchField inRow={false} value={filters.query} onChange={(q) => setF({ query: q })} placeholder={section === 'library' ? 'Rechercher…' : 'Rechercher une automatisation'} />}
        </>
      )}
    </View>
  );

  const automationsView = (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: t.gap, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 820, alignSelf: 'center' }}>
      <Segmented
        value={autoTab}
        onChange={setAutoTab}
        options={[
          { value: 'scheduled', label: 'Envois programmés', icon: 'timer-outline' },
          { value: 'bot', label: 'Systèmes du bot', icon: 'hardware-chip-outline' },
        ]}
      />
      {autoTab === 'scheduled' ? (
        <Automations key={schedule ?? 'list'} preset={schedule} onPresetUsed={() => setSchedule(null)} query={filters.query} />
      ) : (
        <BotSystems query={filters.query} />
      )}
    </ScrollView>
  );

  const body =
    section === 'automations' ? (
      automationsView
    ) : section === 'transfer' ? (
      transfer
    ) : (
      <View style={{ flex: 1 }}>
        {list}
        {selectionBar}
      </View>
    );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (selecting ? endSelection() : onClose())} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[{ flex: 1, backgroundColor: base.bg }, t.css.sheet]}>
        {header}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {medium && sidebar}
          <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
        </View>
        {hover && hoverItem && section === 'library' && <HoverPreview item={hoverItem} folder={folderOf(hoverItem)} rect={hover.rect} />}
      </KeyboardAvoidingView>

      <ContextMenu
        visible={!!menuItem}
        anchor={menu?.anchor ?? null}
        title={menuItem?.name}
        subtitle={menuItem ? (menuItem.kind === 'backup' ? tr('Sauvegarde') : menuItem.builtin ? tr('Modèle intégré') : tr('Modèle')) : undefined}
        entries={menuItem ? menuEntries(menuItem) : []}
        onClose={() => setMenu(null)}
      />
      <PreviewDialog
        item={previewItem}
        folder={previewItem ? folderOf(previewItem) : undefined}
        onClose={() => setPreviewKey(null)}
        onOpen={() => previewItem && loadItem(previewItem)}
        onAppend={() => {
          if (previewItem) appendItem(previewItem);
          setPreviewKey(null);
        }}
        onMore={() => {
          const k = previewKey;
          setPreviewKey(null);
          if (k) setTimeout(() => setMenu({ key: k, anchor: null }), 200);
        }}
      />
      <RenameDialog
        item={renameKey ? byKey.get(renameKey) ?? null : null}
        onClose={() => setRenameKey(null)}
        onSave={(name, description) => {
          const it = renameKey ? byKey.get(renameKey) : undefined;
          if (it) patchItems([it], () => (it.kind === 'template' ? { name, description } : { name }));
          setRenameKey(null);
        }}
      />
      <ItemTagsDialog
        item={tagsKey ? byKey.get(tagsKey) ?? null : null}
        existing={tagList.map((x) => x.tag)}
        onClose={() => setTagsKey(null)}
        onChange={(tags) => {
          const it = tagsKey ? byKey.get(tagsKey) : undefined;
          if (it) patchItems([it], () => ({ tags }));
          setTagsKey(null);
        }}
      />
      <SaveDraftDialog
        visible={dialog === 'save'}
        onClose={() => setDialog(null)}
        folders={folders}
        tags={tagList.map((x) => x.tag)}
        defaultFolder={filters.folder}
        onSaved={(key) => {
          setSection('library');
          setF({ scope: 'all', tag: null, query: '' });
          setHighlight(key);
        }}
      />
      <FolderDialog
        visible={dialog === 'folder'}
        initial={editFolder}
        onClose={() => setDialog(null)}
        onSave={(name, color) => {
          if (editFolder) updateFolder(editFolder.id, { name, color });
          else {
            const id = createFolder(name, color);
            afterFolder.current?.(id);
          }
          afterFolder.current = null;
          setDialog(null);
        }}
      />
      <MoveDialog
        visible={dialog === 'move'}
        count={targetItems.length}
        folders={folders}
        onClose={() => setDialog(null)}
        onNew={() =>
          openFolderDialog(null, (id) => {
            patchItems(targetItems, () => ({ folder: id }));
            toast(targetItems.length > 1 ? 'Éléments déplacés.' : 'Élément déplacé.', 'success');
          })
        }
        onPick={(id) => {
          patchItems(targetItems, () => ({ folder: id }));
          setDialog(null);
          toast(targetItems.length > 1 ? 'Éléments déplacés.' : 'Élément déplacé.', 'success');
        }}
      />
      <TagDialog
        visible={dialog === 'tag'}
        count={targetItems.length}
        existing={tagList.map((x) => x.tag)}
        onClose={() => setDialog(null)}
        onAdd={(tag) => {
          patchItems(targetItems, (i) => ({ tags: i.tags.includes(tag) ? i.tags : [...i.tags, tag] }));
          setDialog(null);
          toast(tr('Étiquette #{tag} ajoutée.', { tag }), 'success');
        }}
      />
      <Dialog visible={dialog === 'sort'} onClose={() => setDialog(null)} title="Trier par" icon="swap-vertical-outline" maxWidth={380}>
        <View style={{ gap: 2 }}>
          {(Object.keys(sortLabel) as SortKey[]).map((k) => (
            <NavRow
              key={k}
              icon={filters.sort === k ? 'radio-button-on' : 'radio-button-off'}
              label={tr(sortLabel[k])}
              active={filters.sort === k}
              onPress={() => {
                setF({ sort: k });
                setDialog(null);
              }}
            />
          ))}
        </View>
        <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr('Les éléments épinglés restent toujours en tête.')}</Text>
      </Dialog>
    </Modal>
  );
}
