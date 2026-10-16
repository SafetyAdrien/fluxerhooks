import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../state/settings';
import { hexToInt, intToHex, readableOn } from '../utils/parse';
import { Button, Input, SectionLabel, Segmented, Sheet, Stack } from './ui';

/* ---------- Conversions ---------- */

export function hsvToInt(h: number, s: number, v: number): number {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return (f(5) << 16) | (f(3) << 8) | f(1);
}

export function intToHsv(c: number): { h: number; s: number; v: number } {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

const rgbOf = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** Palettes prêtes à l'emploi : couleurs Fluxer/Discord + nuances. */
const PALETTE_ROWS: { name: string; colors: number[] }[] = [
  { name: 'Fluxer', colors: [0x4641d9, 0x5865f2, 0x7c78ff, 0x2b2d31, 0x1e1f22, 0xffffff] },
  { name: 'Statuts', colors: [0x57f287, 0xfee75c, 0xed4245, 0xeb459e, 0x3ba55c, 0xfaa61a] },
  { name: 'Vifs', colors: [0xe11d48, 0xf97316, 0xeab308, 0x22c55e, 0x06b6d4, 0x8b5cf6] },
  { name: 'Pastel', colors: [0xfecdd3, 0xfed7aa, 0xfef08a, 0xbbf7d0, 0xa5f3fc, 0xddd6fe] },
  { name: 'Profonds', colors: [0x7f1d1d, 0x7c2d12, 0x713f12, 0x14532d, 0x164e63, 0x3b0764] },
  { name: 'Neutres', colors: [0x000000, 0x18181b, 0x3f3f46, 0x71717a, 0xa1a1aa, 0xe4e4e7] },
];

const HUES = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;

/* ---------- Zone saturation / luminosité ---------- */

function SvSquare({ h, s, v, onChange }: { h: number; s: number; v: number; onChange: (s: number, v: number) => void }) {
  const { theme: t } = useSettings();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pick = (e: GestureResponderEvent) => {
    if (!size.w) return;
    const x = Math.min(Math.max(e.nativeEvent.locationX, 0), size.w);
    const y = Math.min(Math.max(e.nativeEvent.locationY, 0), size.h);
    onChange(x / size.w, 1 - y / size.h);
  };
  const thumb = 26;
  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={pick}
      onResponderMove={pick}
      accessibilityLabel="Saturation et luminosité"
      style={{ width: '100%', aspectRatio: 4 / 3, maxHeight: 300, borderRadius: t.radiusSm, overflow: 'hidden', backgroundColor: intToHex(hsvToInt(h, 1, 1)) }}
    >
      <LinearGradient pointerEvents="none" colors={['#FFFFFF', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', '#000000']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {!!size.w && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: s * size.w - thumb / 2,
            top: (1 - v) * size.h - thumb / 2,
            width: thumb,
            height: thumb,
            borderRadius: thumb / 2,
            borderWidth: 3,
            borderColor: '#fff',
            backgroundColor: intToHex(hsvToInt(h, s, v)),
            elevation: 4,
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 3,
          }}
        />
      )}
    </View>
  );
}

function HueSlider({ h, onChange }: { h: number; onChange: (h: number) => void }) {
  const { theme: t } = useSettings();
  const [w, setW] = useState(0);
  const pick = (e: GestureResponderEvent) => w && onChange(Math.min(Math.max(e.nativeEvent.locationX / w, 0), 0.9999) * 360);
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={pick}
      onResponderMove={pick}
      accessibilityLabel="Teinte"
      style={{ height: t.z(30), justifyContent: 'center' }}
    >
      <LinearGradient pointerEvents="none" colors={HUES} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: t.z(18), borderRadius: 999 }} />
      {!!w && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (h / 360) * w - 13,
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 3,
            borderColor: '#fff',
            backgroundColor: intToHex(hsvToInt(h, 1, 1)),
            elevation: 4,
          }}
        />
      )}
    </View>
  );
}

function Swatch({ c, selected, onPress, size = 40 }: { c: number; selected?: boolean; onPress: () => void; size?: number }) {
  const { theme: t } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`Couleur ${intToHex(c)}`}
      style={{
        width: t.z(size),
        height: t.z(size),
        borderRadius: t.radiusSm,
        backgroundColor: intToHex(c),
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? t.text : t.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected && <Ionicons name="checkmark" size={t.z(18)} color={readableOn(intToHex(c))} />}
    </Pressable>
  );
}

/* ---------- Modal principal ---------- */

export function ColorPickerModal({
  visible,
  value,
  onClose,
  onPick,
  allowNone = true,
  title = 'Couleur',
}: {
  visible: boolean;
  value: number | null;
  onClose: () => void;
  onPick: (c: number | null) => void;
  allowNone?: boolean;
  title?: string;
}) {
  const { theme: t, settings, pushRecentColor, haptic } = useSettings();
  const { width } = useWindowDimensions();
  const start = value ?? 0x4641d9;
  const [hsv, setHsv] = useState(intToHsv(start));
  const [hex, setHex] = useState(intToHex(start));
  const [tab, setTab] = useState<'spectrum' | 'palette' | 'recent'>('spectrum');
  const lastVisible = useRef(false);

  useEffect(() => {
    if (visible && !lastVisible.current) {
      const c = value ?? 0x4641d9;
      setHsv(intToHsv(c));
      setHex(intToHex(c));
    }
    lastVisible.current = visible;
  }, [visible, value]);

  const current = hsvToInt(hsv.h, hsv.s, hsv.v);
  const setFromInt = (c: number) => {
    setHsv(intToHsv(c));
    setHex(intToHex(c));
  };
  const setHsvAndHex = (n: { h: number; s: number; v: number }) => {
    setHsv(n);
    setHex(intToHex(hsvToInt(n.h, n.s, n.v)));
  };
  const [r, g, b] = rgbOf(current);
  const setChannel = (i: number, txt: string) => {
    const n = Math.max(0, Math.min(255, parseInt(txt.replace(/\D/g, '') || '0', 10)));
    const ch = [r, g, b];
    ch[i] = n;
    setFromInt((ch[0] << 16) | (ch[1] << 8) | ch[2]);
  };
  const wide = width >= 640;

  const apply = () => {
    haptic('success');
    pushRecentColor(current);
    onPick(current);
    onClose();
  };

  const spectrum = (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: t.gap }}>
      <View style={{ flex: wide ? 1 : undefined, gap: t.gap }}>
        <SvSquare h={hsv.h} s={hsv.s} v={hsv.v} onChange={(s, v) => setHsvAndHex({ ...hsv, s, v })} />
        <HueSlider h={hsv.h} onChange={(h) => setHsvAndHex({ ...hsv, h })} />
      </View>
      <View style={{ flex: wide ? 1 : undefined, gap: t.gap }}>
        <Input
          label="Hexadécimal"
          value={hex}
          onChangeText={(v) => {
            setHex(v);
            const n = hexToInt(v);
            if (n !== null) setHsv(intToHsv(n));
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          mono
        />
        <Stack row gap={8}>
          {(['R', 'V', 'B'] as const).map((lab, i) => (
            <View key={lab} style={{ flex: 1 }}>
              <Input label={lab} value={String([r, g, b][i])} onChangeText={(v) => setChannel(i, v)} keyboardType="number-pad" maxLength={3} mono />
            </View>
          ))}
        </Stack>
        <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>
          Entier pour l’API : {current} · HSV {Math.round(hsv.h)}°, {Math.round(hsv.s * 100)} %, {Math.round(hsv.v * 100)} %
        </Text>
      </View>
    </View>
  );

  const palette = (
    <View style={{ gap: t.gap }}>
      {PALETTE_ROWS.map((row) => (
        <View key={row.name} style={{ gap: 6 }}>
          <SectionLabel>{row.name}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {row.colors.map((c) => (
              <Swatch key={c} c={c} selected={c === current} onPress={() => setFromInt(c)} />
            ))}
          </View>
        </View>
      ))}
      <SectionLabel>Nuances de la couleur actuelle</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[0.95, 0.8, 0.65, 0.5, 0.35, 0.2].map((v) => {
          const c = hsvToInt(hsv.h, Math.max(0.15, hsv.s), v);
          return <Swatch key={v} c={c} selected={c === current} onPress={() => setFromInt(c)} />;
        })}
      </View>
    </View>
  );

  const recent = settings.recentColors.length ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {settings.recentColors.map((c) => (
        <Swatch key={c} c={c} selected={c === current} onPress={() => setFromInt(c)} size={48} />
      ))}
    </View>
  ) : (
    <Text style={{ color: t.textMuted, textAlign: 'center', padding: 20 }}>Les couleurs que tu appliques apparaîtront ici.</Text>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <Stack row gap={8}>
          {allowNone && (
            <Button
              icon="close-circle-outline"
              label="Aucune"
              onPress={() => {
                onPick(null);
                onClose();
              }}
            />
          )}
          <Button flex variant="primary" icon="checkmark" label="Appliquer" onPress={apply} />
        </Stack>
      }
    >
      {/* Aperçu ancienne → nouvelle couleur */}
      <View style={{ flexDirection: 'row', borderRadius: t.radius, overflow: 'hidden', height: t.z(56), borderWidth: 1, borderColor: t.border }}>
        <Pressable
          onPress={() => value !== null && setFromInt(value)}
          style={{ flex: 1, backgroundColor: value !== null ? intToHex(value) : t.surface2, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: value !== null ? readableOn(intToHex(value)) : t.textMuted, fontWeight: '700', fontSize: t.font(12) }}>
            {value !== null ? `Avant ${intToHex(value)}` : 'Aucune'}
          </Text>
        </Pressable>
        <View style={{ flex: 2, backgroundColor: intToHex(current), alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: readableOn(intToHex(current)), fontWeight: '800', fontSize: t.font(16) }}>{intToHex(current)}</Text>
        </View>
      </View>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'spectrum', label: 'Spectre', icon: 'color-filter-outline' },
          { value: 'palette', label: 'Palettes', icon: 'color-palette-outline' },
          { value: 'recent', label: 'Récentes', icon: 'time-outline' },
        ]}
      />
      {tab === 'spectrum' ? spectrum : tab === 'palette' ? palette : recent}
    </Sheet>
  );
}
