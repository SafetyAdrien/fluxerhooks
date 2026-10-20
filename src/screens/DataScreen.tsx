import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
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

/* ---------- Ligne d'élément ---------- */

function ItemRow({
  item,
  folder,
  active,
  selecting,
  selected,
  onPress,
  onLongPress,
  onToggle,
}: {
  item: LibraryItem;
  folder?: Folder;
  active: boolean;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onToggle: () => void;
}) {
  const { theme: t } = useSettings();
  const meta = [
    item.kind === 'backup' ? tr('Sauvegarde') : item.builtin ? tr('Modèle intégré') : tr('Modèle'),
    plural(item.stats.messages, '{n} message', '{n} messages'),
    item.stats.embeds ? plural(item.stats.embeds, '{n} embed', '{n} embeds') : null,
    item.kind === 'backup' && item.targets ? plural(item.targets, '{n} webhook', '{n} webhooks') : null,
  ].filter(Boolean);
  return (
    <Pressable
      onPress={selecting ? onToggle : onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityState={{ selected: selecting ? selected : active }}
      accessibilityLabel={item.name}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: t.z(12),
        borderRadius: t.radius,
        backgroundColor: selected ? t.accentSoft : active ? t.surface2 : pressed || hovered ? t.surface2 : t.surface,
        borderWidth: 1,
        borderColor: selected || active ? t.accent : t.border,
      })}
    >
      {selecting && (
        <View style={{ paddingTop: 8 }}>
          <Check on={selected} />
        </View>
      )}
      <View style={{ width: t.z(40), height: t.z(40), borderRadius: t.radiusSm, backgroundColor: item.kind === 'template' ? t.accentSoft : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={item.icon as IconName} size={t.z(20)} color={item.kind === 'template' ? t.accent : t.textMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {item.pinned && <MaterialCommunityIcons name="pin" size={t.z(14)} color={t.accent} />}
          <Text numberOfLines={1} style={{ flexShrink: 1, color: t.text, fontWeight: '800', fontSize: t.font(15) }}>
            {item.name}
          </Text>
        </View>
        <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>
          {meta.join(' · ')}
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
      <Text style={{ color: t.textFaint, fontSize: t.font(11), paddingTop: 2 }}>{item.builtin ? '' : fmtDate(item.updatedAt, false)}</Text>
    </Pressable>
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

/* ---------- Détail d'un élément ---------- */

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  const { theme: t } = useSettings();
  return (
    <View style={{ flexGrow: 1, flexBasis: wide ? 170 : 90, padding: 10, borderRadius: t.radiusSm, backgroundColor: t.surface2 }}>
      <Text style={{ color: t.textFaint, fontSize: t.font(11), fontWeight: '700' }}>{tr(label)}</Text>
      <Text numberOfLines={1} style={{ color: t.text, fontSize: t.font(14), fontWeight: '800', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function ItemDetail({
  item,
  folders,
  tags,
  onOpen,
  onAppend,
  onDuplicate,
  onConvert,
  onSchedule,
  onDeleted,
  onNewFolder,
}: {
  item: LibraryItem;
  folders: Folder[];
  tags: string[];
  onOpen: (item: LibraryItem) => void;
  onAppend: (item: LibraryItem) => void;
  onDuplicate: (item: LibraryItem) => void;
  onConvert: (item: LibraryItem) => void;
  onSchedule: (item: LibraryItem) => void;
  onDeleted: () => void;
  onNewFolder: (then: (id: string) => void) => void;
}) {
  const { theme: t, base } = useSettings();
  const { width } = useWindowDimensions();
  const stackMain = width < 520;
  const { state, backups, updateBackups, deleteBackups } = useEditor();
  const { updateTemplates, deleteTemplates, userTemplates } = useLibrary();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(item.name);
  const [desc, setDesc] = useState(item.description);
  const [tagInput, setTagInput] = useState('');
  useEffect(() => {
    setRenaming(false);
    setName(item.name);
    setDesc(item.description);
    setTagInput('');
  }, [item.key, item.name, item.description]);
  const ro = item.builtin;
  const update = (patch: Partial<Backup & Template>) => (item.kind === 'backup' ? updateBackups([item.id], () => patch) : updateTemplates([item.id], () => patch));
  const addTag = (s: string) => {
    const c = cleanTag(s);
    if (c && !item.tags.includes(c)) update({ tags: [...item.tags, c] });
    setTagInput('');
  };
  const commitName = () => {
    const n = name.trim();
    if (n && n !== item.name) update({ name: n });
    if (item.kind === 'template' && desc.trim() !== item.description) update({ description: desc.trim() });
    setRenaming(false);
  };
  const exportOne = async () => {
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
  const overwrite = () =>
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
  const remove = () =>
    Alert.alert(tr('Supprimer « {name} » ?', { name: item.name }), tr('Cette action est définitive (sur tous les appareils liés).'), [
      { text: tr('Annuler'), style: 'cancel' },
      {
        text: tr('Supprimer'),
        style: 'destructive',
        onPress: () => {
          if (item.kind === 'backup') deleteBackups([item.id]);
          else deleteTemplates([item.id]);
          toast('Élément supprimé.', 'success');
          onDeleted();
        },
      },
    ]);
  const folderOptions = [
    { value: 'none', label: tr('Non classé') },
    ...folders.map((f) => ({ value: f.id, label: f.name, left: <FolderDot color={f.color} /> })),
    { value: '__new', label: tr('Nouveau dossier…'), left: <Ionicons name="add" size={t.z(16)} color={t.accent} /> },
  ];
  const known = folders.some((f) => f.id === item.folder);
  const editable = !ro && (item.kind === 'backup' || userTemplates.some((x) => x.id === item.id));

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}>
      {/* En-tête */}
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ width: t.z(52), height: t.z(52), borderRadius: t.radius, backgroundColor: item.kind === 'template' ? t.accentSoft : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={item.icon as IconName} size={t.z(26)} color={item.kind === 'template' ? t.accent : t.textMuted} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          {renaming ? (
            <>
              <Input value={name} onChangeText={setName} max={60} autoFocus onSubmitEditing={commitName} />
              {item.kind === 'template' && <Input value={desc} onChangeText={setDesc} placeholder="Description" max={100} />}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button small flex label="Annuler" onPress={() => { setRenaming(false); setName(item.name); setDesc(item.description); }} />
                <Button small flex variant="primary" icon="checkmark" label="Valider" onPress={commitName} />
              </View>
            </>
          ) : (
            <>
              <Text selectable style={{ color: t.text, fontSize: t.font(20), fontWeight: '900' }}>
                {item.name}
              </Text>
              {!!item.description && <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>{item.description}</Text>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Badge text={item.kind === 'backup' ? tr('Sauvegarde') : tr('Modèle')} color={item.kind === 'template' ? t.accent : undefined} />
                {item.builtin && <Badge text={tr('Intégré')} />}
              </View>
            </>
          )}
        </View>
        {!renaming && editable && (
          <View style={{ flexDirection: 'row' }}>
            <IconBtn icon="pencil-outline" label="Renommer" onPress={() => setRenaming(true)} />
            <IconBtn icon={item.pinned ? 'pin' : 'pin-outline'} label={item.pinned ? 'Désépingler' : 'Épingler'} color={item.pinned ? t.accent : undefined} onPress={() => update({ pinned: !item.pinned })} />
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: stackMain ? 'column' : 'row', gap: 8 }}>
          <Button flex={!stackMain} variant="primary" icon="open-outline" label="Ouvrir dans l’éditeur" onPress={() => onOpen(item)} />
          <Button flex={!stackMain} icon="add" label="Ajouter au brouillon" onPress={() => onAppend(item)} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button small icon="copy-outline" label="Dupliquer" onPress={() => onDuplicate(item)} />
          <Button small icon={item.kind === 'backup' ? 'bookmark-outline' : 'archive-outline'} label={item.kind === 'backup' ? 'Enregistrer comme modèle' : 'Enregistrer comme sauvegarde'} onPress={() => onConvert(item)} />
          {editable && <Button small icon="refresh-outline" label="Remplacer par le brouillon" onPress={overwrite} />}
          <Button small icon="timer-outline" label="Programmer un envoi" onPress={() => onSchedule(item)} />
          <Button small icon="share-outline" label="Exporter le JSON" onPress={exportOne} />
          {editable && <Button small variant="danger" icon="trash-outline" label="Supprimer" onPress={remove} />}
        </View>
        {ro && <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr('Modèle intégré : duplique-le pour le renommer, le ranger ou le modifier.')}</Text>}
      </View>

      {/* Informations */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Stat label="Messages" value={String(item.stats.messages)} />
        <Stat label="Embeds" value={String(item.stats.embeds)} />
        {item.kind === 'backup' && <Stat label="Webhooks" value={String(item.targets)} />}
        {item.kind === 'backup' && <Stat label="Fichiers" value={String(item.stats.files)} />}
        {!ro && <Stat wide label="Créé le" value={fmtDate(item.createdAt)} />}
        {!ro && <Stat wide label="Modifié le" value={fmtDate(item.updatedAt)} />}
      </View>

      {/* Rangement */}
      {editable && (
        <Box title="Rangement" icon="folder-outline" collapsible={false}>
          <Dropdown
            label="Dossier"
            title="Dossier"
            value={known ? item.folder : 'none'}
            searchable={folders.length > 8}
            options={folderOptions}
            onChange={(v) => {
              if (v === '__new') onNewFolder((id) => update({ folder: id }));
              else update({ folder: v === 'none' ? null : v });
            }}
          />
          <Input label="Étiquettes" value={tagInput} onChangeText={setTagInput} placeholder="Ajouter une étiquette puis Entrée" max={32} onSubmitEditing={() => addTag(tagInput)} blurOnSubmit={false} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {item.tags.map((x) => (
              <TagPill key={x} tag={x} onRemove={() => update({ tags: item.tags.filter((y) => y !== x) })} />
            ))}
            {tags
              .filter((x) => !item.tags.includes(x))
              .slice(0, 6)
              .map((x) => (
                <Chip key={x} label={`+ #${x}`} onPress={() => addTag(x)} />
              ))}
            {!item.tags.length && !tags.length && <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr('Aucune étiquette.')}</Text>}
          </View>
        </Box>
      )}

      {/* Aperçu */}
      <View style={{ gap: 6 }}>
        <Text style={{ color: t.textFaint, fontSize: t.font(11), fontWeight: '800', letterSpacing: 0.7 }}>{tr('APERÇU')}</Text>
        <View style={{ borderRadius: t.radius, backgroundColor: base.preview, borderWidth: 1, borderColor: t.border, padding: 10, gap: 10 }}>
          {item.messages.length ? <PreviewList messages={item.messages} /> : <Text style={{ color: t.textFaint }}>{tr('Aucun message.')}</Text>}
        </View>
      </View>
    </ScrollView>
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
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [dialog, setDialog] = useState<null | 'save' | 'folder' | 'move' | 'tag' | 'sort'>(null);
  const [editFolder, setEditFolder] = useState<Folder | null>(null);
  const afterFolder = useRef<((id: string) => void) | null>(null);
  const [schedule, setSchedule] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const items = useMemo(() => buildItems(backups, templates), [backups, templates]);
  const tagList = useMemo(() => allTags(items), [items]);
  const visibleItems = useMemo(() => filterItems(items, filters, folders), [items, filters, folders]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const active = items.find((i) => i.key === activeKey) ?? null;
  const folderCount = (id: string | null) => items.filter((i) => (id === null ? !i.builtin && (!i.folder || !folderById.has(i.folder)) : i.folder === id)).length;

  // Sur grand écran, un élément est toujours affiché dans le panneau de détail.
  useEffect(() => {
    if (wide && section === 'library' && (!active || !visibleItems.some((i) => i.key === active.key))) setActiveKey(visibleItems[0]?.key ?? null);
  }, [wide, section, visibleItems, active]);
  // La sélection ne garde que les éléments encore présents.
  useEffect(() => {
    setSelected((s) => {
      const keys = new Set(items.map((i) => i.key));
      const next = new Set([...s].filter((k) => keys.has(k)));
      return next.size === s.size ? s : next;
    });
  }, [items]);

  const selItems = items.filter((i) => selected.has(i.key));
  const selEditable = selItems.filter((i) => !i.builtin);
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
    const byKey = new Map(list.map((i) => [i.key, i]));
    if (b.length) updateBackups(b.map((i) => i.id), (x) => patch(byKey.get(`backup:${x.id}`)!));
    if (tp.length) updateTemplates(tp.map((i) => i.id), (x) => patch(byKey.get(`template:${x.id}`)!));
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
    setActiveKey(key);
    toast('Élément dupliqué.', 'success');
  };
  const convertItem = (item: LibraryItem) => {
    const meta = { folder: item.folder, tags: item.tags };
    let key: string;
    if (item.kind === 'backup') key = `template:${saveTemplate(item.name, '', 'document-text-outline', item.messages, meta)}`;
    else key = `backup:${saveBackup(item.name, { ...meta, state: { targets: state.targets, messages: item.messages.map(cloneMessage) } })}`;
    setActiveKey(key);
    toast(item.kind === 'backup' ? 'Modèle créé à partir de la sauvegarde.' : 'Sauvegarde créée à partir du modèle (avec les destinations actuelles).', 'success');
  };
  const scheduleItem = (item: LibraryItem) => {
    setSchedule(`${item.kind}:${item.id}`);
    setMobileDetail(false);
    setSection('automations');
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
      setActiveKey(r.backups[0] ? `backup:${r.backups[0].id}` : r.templates[0] ? `template:${r.templates[0].id}` : null);
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

  const openItem = (item: LibraryItem) => {
    setActiveKey(item.key);
    if (!wide) setMobileDetail(true);
  };

  /* ----- Rendu ----- */
  const scopeLabel: Record<Scope, string> = { all: 'Tout', backup: 'Sauvegardes', template: 'Modèles', pinned: 'Épinglés' };
  const sortLabel: Record<SortKey, string> = { updated: 'Modifiés récemment', created: 'Créés récemment', name: 'Nom (A → Z)', messages: 'Nombre de messages' };
  const currentFolder = filters.folder && filters.folder !== 'none' ? folderById.get(filters.folder) : undefined;
  const listTitle = currentFolder ? currentFolder.name : filters.folder === 'none' ? tr('Non classés') : filters.tag ? `#${filters.tag}` : tr(scopeLabel[filters.scope]);

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
          active={section === 'library' && filters.scope === s && !filters.folder && !filters.tag}
          onPress={() => {
            setSection('library');
            setF({ scope: s, folder: null, tag: null });
          }}
        />
      ))}
      <GroupLabel right={<IconBtn icon="add" label="Nouveau dossier" size={17} onPress={() => openFolderDialog(null)} />}>Dossiers</GroupLabel>
      <NavRow icon="file-tray-outline" label={tr('Non classés')} count={folderCount(null)} active={section === 'library' && filters.folder === 'none'} onPress={() => { setSection('library'); setF({ folder: 'none', tag: null, scope: 'all' }); }} />
      {folders.map((f) => (
        <NavRow key={f.id} color={f.color} label={f.name} count={folderCount(f.id)} active={section === 'library' && filters.folder === f.id} onPress={() => { setSection('library'); setF({ folder: f.id, tag: null, scope: 'all' }); }} />
      ))}
      {!folders.length && (
        <Pressable onPress={() => openFolderDialog(null)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr('Crée des dossiers pour ranger tes messages.')}</Text>
        </Pressable>
      )}
      {tagList.length > 0 && <GroupLabel>Étiquettes</GroupLabel>}
      {tagList.slice(0, 30).map(({ tag, count }) => (
        <NavRow key={tag} icon="pricetag-outline" label={`#${tag}`} count={count} active={section === 'library' && filters.tag === tag} onPress={() => { setSection('library'); setF({ tag, folder: null, scope: 'all' }); }} />
      ))}
      <GroupLabel>Outils</GroupLabel>
      <NavRow icon="timer-outline" label={tr('Automatisations')} count={automations.length} active={section === 'automations'} onPress={() => setSection('automations')} />
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
      {tagList.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {tagList.slice(0, 20).map(({ tag }) => (
            <Chip key={tag} label={`#${tag}`} selected={filters.tag === tag} onPress={() => setF({ tag: filters.tag === tag ? null : tag })} />
          ))}
        </ScrollView>
      )}
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
          <IconBtn icon="create-outline" label="Modifier le dossier" size={17} onPress={() => openFolderDialog(currentFolder)} />
          <IconBtn icon="trash-outline" label="Supprimer le dossier" size={17} color={t.danger} onPress={() => removeFolder(currentFolder)} />
        </>
      )}
      {filters.tag && <IconBtn icon="trash-outline" label="Retirer cette étiquette partout" size={17} color={t.danger} onPress={() => removeTag(filters.tag!)} />}
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={() => setDialog('sort')}
        accessibilityRole="button"
        accessibilityLabel={tr('Trier : {s}', { s: tr(sortLabel[filters.sort]) })}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: t.z(34), borderRadius: 999, backgroundColor: pressed ? t.accentSoft : t.surface2, borderWidth: 1, borderColor: t.border })}
      >
        <MaterialCommunityIcons name="sort" size={t.z(16)} color={t.textMuted} />
        {medium && <Text style={{ color: t.textMuted, fontSize: t.font(12), fontWeight: '700' }}>{tr(sortLabel[filters.sort])}</Text>}
      </Pressable>
      <Pressable
        onPress={() => (selecting ? endSelection() : setSelecting(true))}
        accessibilityRole="button"
        accessibilityLabel={tr(selecting ? 'Terminer la sélection' : 'Sélectionner')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: t.z(34), borderRadius: 999, backgroundColor: selecting ? t.accent : pressed ? t.accentSoft : t.surface2, borderWidth: 1, borderColor: selecting ? t.accent : t.border })}
      >
        <MaterialCommunityIcons name={selecting ? 'close' : 'checkbox-multiple-marked-outline'} size={t.z(16)} color={selecting ? t.onAccent : t.textMuted} />
        {medium && <Text style={{ color: selecting ? t.onAccent : t.textMuted, fontSize: t.font(12), fontWeight: '700' }}>{tr(selecting ? 'Terminer' : 'Sélectionner')}</Text>}
      </Pressable>
    </View>
  );

  const list = (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: selecting ? 120 : insets.bottom + 32 }}>
      {!medium && mobileFilters}
      {toolbar}
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
        visibleItems.map((i) => (
          <ItemRow
            key={i.key}
            item={i}
            folder={i.folder ? folderById.get(i.folder) : undefined}
            active={wide && i.key === activeKey}
            selecting={selecting}
            selected={selected.has(i.key)}
            onPress={() => openItem(i)}
            onLongPress={() => {
              setSelecting(true);
              toggleSel(i.key);
            }}
            onToggle={() => toggleSel(i.key)}
          />
        ))
      )}
    </ScrollView>
  );

  const detail = active ? (
    <ItemDetail
      key={active.key}
      item={active}
      folders={folders}
      tags={tagList.map((x) => x.tag)}
      onOpen={loadItem}
      onAppend={appendItem}
      onDuplicate={duplicateItem}
      onConvert={convertItem}
      onSchedule={scheduleItem}
      onDeleted={() => {
        setActiveKey(null);
        setMobileDetail(false);
      }}
      onNewFolder={(then) => openFolderDialog(null, then)}
    />
  ) : (
    <EmptyState icon="document-text-outline" title="Aucun élément sélectionné" text="Choisis une sauvegarde ou un modèle pour voir son aperçu et ses actions." />
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
        gap: 2,
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
      <IconBtn icon="folder-open-outline" label="Déplacer vers un dossier" disabled={!selEditable.length} onPress={() => setDialog('move')} />
      <IconBtn icon="pricetag-outline" label="Ajouter une étiquette" disabled={!selEditable.length} onPress={() => setDialog('tag')} />
      <IconBtn icon="pin-outline" label="Épingler / désépingler" disabled={!selEditable.length} onPress={bulkPin} />
      <IconBtn icon="share-outline" label="Exporter la sélection" disabled={!selected.size} onPress={() => exportItems(selItems)} />
      <IconBtn icon="trash-outline" label="Supprimer la sélection" color={t.danger} disabled={!selEditable.length} onPress={bulkDelete} />
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
        <Pressable
          onPress={() => (mobileDetail ? setMobileDetail(false) : onClose())}
          accessibilityRole="button"
          accessibilityLabel={tr('Retour')}
          hitSlop={6}
          style={({ pressed }) => ({ width: t.z(40), height: t.z(40), borderRadius: t.z(14), alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.accentSoft : t.surface2 })}
        >
          <MaterialCommunityIcons name="arrow-left" size={t.z(22)} color={t.text} />
        </Pressable>
        <View style={{ flexShrink: 1, minWidth: 0, marginRight: 4 }}>
          <Text numberOfLines={1} style={{ color: t.text, fontSize: t.font(18), fontWeight: '900' }}>
            {mobileDetail && active ? active.name : tr('Données')}
          </Text>
          {!(mobileDetail && active) && (
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(11) }}>
              {plural(backups.length, '{n} sauvegarde', '{n} sauvegardes')} · {plural(userTemplates.length, '{n} modèle', '{n} modèles')} · {plural(folders.length, '{n} dossier', '{n} dossiers')}
            </Text>
          )}
        </View>
        {medium && section === 'library' && !mobileDetail && <SearchField value={filters.query} onChange={(q) => setF({ query: q })} placeholder="Rechercher dans les noms, étiquettes et messages" />}
        {medium && section === 'automations' && <SearchField value={filters.query} onChange={(q) => setF({ query: q })} placeholder="Rechercher une automatisation" />}
        {(!medium || section === 'transfer') && <View style={{ flex: 1 }} />}
        {!mobileDetail && <IconBtn icon="download-outline" label="Importer un fichier" onPress={importFile} />}
        {!mobileDetail &&
          (medium ? (
            <Button variant="primary" small icon="save-outline" label="Enregistrer le brouillon" onPress={() => setDialog('save')} />
          ) : (
            <Pressable onPress={() => setDialog('save')} accessibilityRole="button" accessibilityLabel={tr('Enregistrer le brouillon')} style={({ pressed }) => ({ width: t.z(40), height: t.z(40), borderRadius: t.z(14), alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.accentPressed : t.accent })}>
              <Ionicons name="save-outline" size={t.z(20)} color={t.onAccent} />
            </Pressable>
          ))}
      </View>
      {!medium && !mobileDetail && (
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
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: t.gap, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
      <Automations key={schedule ?? 'list'} preset={schedule} onPresetUsed={() => setSchedule(null)} query={filters.query} />
    </ScrollView>
  );

  let body: React.ReactNode;
  if (section === 'automations') body = automationsView;
  else if (section === 'transfer') body = transfer;
  else if (wide)
    body = (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {list}
          {selectionBar}
        </View>
        <View style={{ width: Math.min(480, Math.max(380, width * 0.36)), flexGrow: 0, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: t.border, backgroundColor: base.bg }}>{detail}</View>
      </View>
    );
  else if (mobileDetail) body = detail;
  else
    body = (
      <View style={{ flex: 1 }}>
        {list}
        {selectionBar}
      </View>
    );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (mobileDetail ? setMobileDetail(false) : selecting ? endSelection() : onClose())} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[{ flex: 1, backgroundColor: base.bg }, t.css.sheet]}>
        {header}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {medium && sidebar}
          <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
        </View>
      </KeyboardAvoidingView>

      <SaveDraftDialog
        visible={dialog === 'save'}
        onClose={() => setDialog(null)}
        folders={folders}
        tags={tagList.map((x) => x.tag)}
        defaultFolder={filters.folder}
        onSaved={(key) => {
          setSection('library');
          setF({ scope: 'all', tag: null, query: '' });
          setActiveKey(key);
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
        count={selEditable.length}
        folders={folders}
        onClose={() => setDialog(null)}
        onNew={() =>
          openFolderDialog(null, (id) => {
            patchItems(selEditable, () => ({ folder: id }));
            toast('Éléments déplacés.', 'success');
          })
        }
        onPick={(id) => {
          patchItems(selEditable, () => ({ folder: id }));
          setDialog(null);
          toast('Éléments déplacés.', 'success');
        }}
      />
      <TagDialog
        visible={dialog === 'tag'}
        count={selEditable.length}
        existing={tagList.map((x) => x.tag)}
        onClose={() => setDialog(null)}
        onAdd={(tag) => {
          patchItems(selEditable, (i) => ({ tags: i.tags.includes(tag) ? i.tags : [...i.tags, tag] }));
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
