import React, { useState } from 'react';
import { tr } from '../i18n';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, FlipType, SaveFormat, type Action } from 'expo-image-manipulator';
import * as FS from 'expo-file-system/legacy';
import { useSettings } from '../state/settings';
import { uid } from '../utils/factory';
import { Button, Chip, EmptyState, IconBtn, Input, SectionLabel, Segmented, Sheet, Stack, useToast } from './ui';
import type { LocalAttachment } from '../types';

interface Item {
  id: string;
  uri: string; // fichier d'origine
  name: string;
  width: number;
  height: number;
  rotate: number; // degrés, multiple de 90
  flipH: boolean;
  flipV: boolean;
  scale: number; // 0.1 – 1
  format: 'jpeg' | 'png' | 'webp';
  quality: number;
}

const baseName = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 60) || 'image';

/**
 * Import d'une ou plusieurs images avec retouche : rotation ±90°, miroir horizontal / vertical,
 * redimensionnement et format de sortie. Produit des pièces jointes prêtes à envoyer.
 */
export function ImageImportSheet({
  visible,
  onClose,
  onConfirm,
  title = 'Importer des images',
  single,
  confirmLabel = 'Ajouter au message',
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (files: LocalAttachment[]) => void;
  title?: string;
  single?: boolean;
  confirmLabel?: string;
}) {
  const { theme: t, haptic } = useSettings();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = items.find((x) => x.id === sel) ?? items[0];
  const up = (p: Partial<Item>) => current && setItems((list) => list.map((x) => (x.id === current.id ? { ...x, ...p } : x)));

  const pick = async (camera = false) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return toast('Autorise l’appareil photo dans les réglages Android.', 'error');
      }
      const res = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: !single, selectionLimit: single ? 1 : 10, quality: 1 });
      if (res.canceled) return;
      const added: Item[] = res.assets.map((a) => ({
        id: uid(),
        uri: a.uri,
        name: baseName(a.fileName ?? `image-${Date.now()}`),
        width: a.width,
        height: a.height,
        rotate: 0,
        flipH: false,
        flipV: false,
        scale: 1,
        format: a.mimeType === 'image/png' ? 'png' : 'jpeg',
        quality: 0.9,
      }));
      setItems((prev) => (single ? added : [...prev, ...added].slice(0, 10)));
      setSel(added[0]?.id ?? null);
    } catch {
      toast('Impossible d’accéder aux images.', 'error');
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const out: LocalAttachment[] = [];
      for (const it of items) {
        const actions: Action[] = [];
        if (it.rotate % 360) actions.push({ rotate: it.rotate % 360 });
        if (it.flipH) actions.push({ flip: FlipType.Horizontal });
        if (it.flipV) actions.push({ flip: FlipType.Vertical });
        if (it.scale < 1) {
          const sideways = Math.abs(it.rotate % 180) === 90;
          actions.push({ resize: { width: Math.max(16, Math.round((sideways ? it.height : it.width) * it.scale)) } });
        }
        const format = it.format === 'png' ? SaveFormat.PNG : it.format === 'webp' ? SaveFormat.WEBP : SaveFormat.JPEG;
        const r = await manipulateAsync(it.uri, actions, { compress: it.quality, format });
        const info = await FS.getInfoAsync(r.uri);
        out.push({
          id: uid(),
          uri: r.uri,
          name: `${it.name}.${it.format === 'jpeg' ? 'jpg' : it.format}`,
          mimeType: `image/${it.format}`,
          size: info.exists && 'size' in info ? (info.size ?? 0) : 0,
          spoiler: false,
          description: '',
        });
      }
      haptic('success');
      onConfirm(out);
      setItems([]);
      setSel(null);
      onClose();
    } catch {
      toast('Échec du traitement de l’image.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const box = Math.min(width - 32, 420);
  const sideways = current ? Math.abs(current.rotate % 180) === 90 : false;
  const outW = current ? Math.round((sideways ? current.height : current.width) * current.scale) : 0;
  const outH = current ? Math.round((sideways ? current.width : current.height) * current.scale) : 0;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      full
      footer={
        <Stack row gap={8}>
          <Button mci="image-multiple-outline" onPress={() => pick(false)} />
          <Button mci="camera-plus-outline" onPress={() => pick(true)} />
          <Button flex variant="primary" icon="checkmark" label={`${confirmLabel}${items.length > 1 ? ` (${items.length})` : ''}`} disabled={!items.length} loading={busy} onPress={confirm} />
        </Stack>
      }
    >
      {!items.length ? (
        <EmptyState
          icon="images-outline"
          title="Aucune image"
          text={single ? 'Choisis une image à importer.' : 'Choisis une ou plusieurs images (10 max.) depuis ta galerie ou l’appareil photo.'}
          action={
            <Stack row gap={8}>
              <Button variant="primary" mci="image-multiple-outline" label="Galerie" onPress={() => pick(false)} />
              <Button mci="camera-plus-outline" label="Photo" onPress={() => pick(true)} />
            </Stack>
          }
        />
      ) : (
        <>
          {items.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {items.map((it) => (
                <Pressable key={it.id} onPress={() => setSel(it.id)} style={{ borderRadius: t.radiusSm, borderWidth: 3, borderColor: it.id === current?.id ? t.accent : 'transparent' }}>
                  <Image source={{ uri: it.uri }} style={{ width: t.z(64), height: t.z(64), borderRadius: t.radiusSm - 2, transform: [{ rotate: `${it.rotate}deg` }, { scaleX: it.flipH ? -1 : 1 }, { scaleY: it.flipV ? -1 : 1 }] }} />
                </Pressable>
              ))}
            </ScrollView>
          )}
          {current && (
            <>
              <View style={{ width: '100%', height: box, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2, borderRadius: t.radius, overflow: 'hidden' }}>
                <Image
                  source={{ uri: current.uri }}
                  resizeMode="contain"
                  style={{
                    width: box * 0.9,
                    height: box * 0.9,
                    transform: [{ rotate: `${current.rotate}deg` }, { scaleX: current.flipH ? -1 : 1 }, { scaleY: current.flipV ? -1 : 1 }],
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
                <IconBtn icon="arrow-undo-outline" label="Pivoter à gauche" size={24} onPress={() => up({ rotate: current.rotate - 90 })} />
                <IconBtn icon="arrow-redo-outline" label="Pivoter à droite" size={24} onPress={() => up({ rotate: current.rotate + 90 })} />
                <IconBtn icon="swap-horizontal-outline" label="Miroir horizontal" size={24} color={current.flipH ? t.accent : undefined} onPress={() => up({ flipH: !current.flipH })} />
                <IconBtn icon="swap-vertical-outline" label="Miroir vertical" size={24} color={current.flipV ? t.accent : undefined} onPress={() => up({ flipV: !current.flipV })} />
                <IconBtn icon="refresh-outline" label="Réinitialiser" size={24} onPress={() => up({ rotate: 0, flipH: false, flipV: false, scale: 1 })} />
                <IconBtn icon="trash-outline" label="Retirer l’image" size={24} color={t.danger} onPress={() => { setItems((l) => l.filter((x) => x.id !== current.id)); setSel(null); }} />
              </View>
              <SectionLabel right={<Text style={{ color: t.textMuted, fontSize: t.font(12) }}>{outW} × {outH} px</Text>}>Taille</SectionLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[1, 0.75, 0.5, 0.33, 0.25].map((s) => (
                  <Chip key={s} label={s === 1 ? 'Originale' : `${Math.round(s * 100)} %`} selected={Math.abs(current.scale - s) < 0.01} onPress={() => up({ scale: s })} />
                ))}
                {[1920, 1280, 800, 512, 256].map((w) => {
                  const base = sideways ? current.height : current.width;
                  if (w >= base) return null;
                  const s = w / base;
                  return <Chip key={w} label={`${w} px`} selected={Math.abs(current.scale - s) < 0.001} onPress={() => up({ scale: s })} />;
                })}
              </View>
              <Input
                label="Largeur personnalisée (px)"
                value={String(outW)}
                onChangeText={(v) => {
                  const n = parseInt(v.replace(/\D/g, ''), 10);
                  const base = sideways ? current.height : current.width;
                  if (n > 0) up({ scale: Math.min(1, n / base) });
                }}
                keyboardType="number-pad"
                mono
              />
              <Segmented
                value={current.format}
                onChange={(v) => up({ format: v })}
                options={[
                  { value: 'jpeg', label: 'JPEG' },
                  { value: 'png', label: 'PNG' },
                  { value: 'webp', label: 'WebP' },
                ]}
              />
              {current.format !== 'png' && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[1, 0.9, 0.75, 0.6].map((q) => (
                    <Chip key={q} label={`Qualité ${Math.round(q * 100)} %`} selected={current.quality === q} onPress={() => up({ quality: q })} />
                  ))}
                </View>
              )}
              <Input label="Nom du fichier" value={current.name} onChangeText={(v) => up({ name: baseName(v) })} autoCapitalize="none" right={<Text style={{ color: t.textFaint }}>.{current.format === 'jpeg' ? 'jpg' : current.format}</Text>} />
              <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>
                <Ionicons name="information-circle-outline" size={t.z(12)} /> Original {current.width} × {current.height} px · les retouches sont appliquées à l’import.
              </Text>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

