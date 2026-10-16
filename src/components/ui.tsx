import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useSettings, useTheme } from '../state/settings';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ---------- Mise en page flexible ---------- */

/** Pile verticale ou horizontale avec espacement automatique (gap natif RN ≥ 0.71). */
export function Stack({
  children,
  row,
  gap,
  wrap,
  align,
  justify,
  style,
  flex,
}: {
  children?: React.ReactNode;
  row?: boolean;
  gap?: number;
  wrap?: boolean;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
  flex?: number;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: row ? 'row' : 'column',
          gap: gap ?? t.gap,
          flexWrap: wrap ? 'wrap' : 'nowrap',
          alignItems: align ?? (row ? 'center' : 'stretch'),
          justifyContent: justify,
          flex,
          minWidth: 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Grille responsive : place les enfants en colonnes selon la largeur disponible. */
export function Grid({ children, min = 150, gap }: { children: React.ReactNode; min?: number; gap?: number }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const g = gap ?? t.gap;
  const cols = w ? Math.max(1, Math.floor((w + g) / (min + g))) : 1;
  const itemW = w ? (w - g * (cols - 1)) / cols : undefined;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: g }}>
      {React.Children.toArray(children).map((c, i) => (
        <View key={i} style={{ width: itemW ?? '100%' }}>
          {c}
        </View>
      ))}
    </View>
  );
}

/* ---------- Box : conteneur repliable ---------- */

/** Couleur de fond du conteneur parent : les champs prennent la teinte opposée pour rester visibles. */
const SurfaceContext = createContext<'surface' | 'surface2'>('surface');

export function Box({
  title,
  subtitle,
  icon,
  accent,
  collapsible = true,
  collapsed,
  onToggle,
  actions,
  badge,
  children,
  style,
  nested,
  defaultCollapsed,
}: {
  defaultCollapsed?: boolean;
  title?: string;
  subtitle?: string;
  icon?: IconName;
  accent?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  actions?: React.ReactNode;
  badge?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  nested?: boolean;
}) {
  const t = useTheme();
  const [inner, setInner] = useState(!!defaultCollapsed);
  const isCollapsed = collapsed ?? inner;
  const parent = useContext(SurfaceContext);
  const level: 'surface' | 'surface2' = nested ? (parent === 'surface2' ? 'surface' : 'surface2') : 'surface';
  const toggle = onToggle ?? (() => setInner((v) => !v));
  return (
    <View
      style={[
        {
          backgroundColor: t[level],
          borderRadius: t.radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.border,
          overflow: 'hidden',
        },
        accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null,
        t.css.box,
        nested ? t.css['box-nested'] : null,
        style,
      ]}
    >
      {title !== undefined && (
        <Pressable
          onPress={collapsible ? toggle : undefined}
          android_ripple={collapsible ? { color: t.accentSoft } : undefined}
          accessibilityRole={collapsible ? 'button' : undefined}
          accessibilityState={collapsible ? { expanded: !isCollapsed } : undefined}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.pad, paddingVertical: t.pad - 2, gap: 10 }}
        >
          {collapsible && (
            <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={t.z(18)} color={t.textMuted} />
          )}
          {icon && <Ionicons name={icon} size={t.z(18)} color={accent ?? t.accent} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[{ color: t.text, fontWeight: '700', fontSize: t.font(15) }, t.css.title]}>
              {title}
            </Text>
            {!!subtitle && (
              <Text numberOfLines={1} style={[{ color: t.textMuted, fontSize: t.font(12), marginTop: 1 }, t.css.subtitle]}>
                {subtitle}
              </Text>
            )}
          </View>
          {!!badge && <Badge text={badge} />}
          {actions && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>{actions}</View>}
        </Pressable>
      )}
      {!isCollapsed && (
        <SurfaceContext.Provider value={level}>
          <View style={{ paddingHorizontal: t.pad, paddingBottom: t.pad, paddingTop: title !== undefined ? 0 : t.pad, gap: t.gap }}>
            {children}
          </View>
        </SurfaceContext.Provider>
      )}
    </View>
  );
}

export function Badge({ text, color }: { text: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: color ?? t.accentSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: color ? '#fff' : t.accent, fontSize: t.font(11), fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
      <Text
        style={[{ flex: 1, color: t.textMuted, fontSize: t.font(11), fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }, t.css.label]}
      >
        {children}
      </Text>
      {right}
    </View>
  );
}

/* ---------- Champs ---------- */

export function Input({
  label,
  value,
  onChangeText,
  max,
  hint,
  error,
  multiline,
  mono,
  style,
  right,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & {
  label?: string;
  max?: number;
  hint?: string;
  error?: string | null;
  mono?: boolean;
  right?: React.ReactNode;
}) {
  const { theme: t, settings } = useSettings();
  const [focus, setFocus] = useState(false);
  const surface = useContext(SurfaceContext);
  const fieldBg = surface === 'surface2' ? t.surface : t.surface2;
  const len = (value ?? '').length;
  const over = max !== undefined && len > max;
  return (
    <View style={{ gap: 5, minWidth: 0 }}>
      {(label || (max && settings.showCounters)) && (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {!!label && (
            <Text style={[{ flex: 1, color: t.textMuted, fontSize: t.font(12), fontWeight: '700' }, t.css.label]}>{label}</Text>
          )}
          {max !== undefined && settings.showCounters && (focus || over || len > max * 0.85) && (
            <Text style={{ color: over ? t.danger : t.textFaint, fontSize: t.font(11) }}>
              {len}/{max}
            </Text>
          )}
        </View>
      )}
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: multiline ? 'flex-start' : 'center',
            backgroundColor: fieldBg,
            borderRadius: t.radiusSm,
            borderWidth: 1.5,
            borderColor: 'transparent',
          },
          t.css.input,
          error || over ? { borderColor: t.danger, borderWidth: 1.5 } : focus ? { borderColor: t.accent, borderWidth: 1.5 } : null,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          placeholderTextColor={t.textFaint}
          selectionColor={t.accent}
          cursorColor={t.accent}
          onFocus={(e) => {
            setFocus(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            onBlur?.(e);
          }}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[
            {
              flex: 1,
              minWidth: 0,
              width: '100%',
              color: t.text,
              fontSize: t.font(15),
              paddingHorizontal: 12,
              paddingVertical: Platform.OS === 'android' ? 9 : 11,
              minHeight: t.z(multiline ? 92 : 44),
              fontFamily: mono ? (Platform.OS === 'android' ? 'monospace' : 'Menlo') : undefined,
            },
            t.css['input-text'],
            style,
          ]}
          {...rest}
        />
        {right && <View style={{ paddingRight: 6, paddingTop: multiline ? 6 : 0, flexShrink: 0 }}>{right}</View>}
      </View>
      {!!(error || hint) && (
        <Text style={{ color: error ? t.danger : t.textFaint, fontSize: t.font(12) }}>{error || hint}</Text>
      )}
    </View>
  );
}

/* ---------- Boutons ---------- */

export function Button({
  label,
  icon,
  onPress,
  variant = 'secondary',
  loading,
  disabled,
  small,
  flex,
  style,
}: {
  label?: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  flex?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme: t, haptic } = useSettings();
  const bg =
    variant === 'primary'
      ? t.accent
      : variant === 'danger'
        ? t.danger
        : variant === 'success'
          ? t.success
          : variant === 'secondary'
            ? t.surface2
            : 'transparent';
  const fg = variant === 'primary' ? t.onAccent : variant === 'danger' || variant === 'success' ? '#fff' : variant === 'ghost' ? t.accent : t.text;
  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress?.();
      }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: t.radiusSm,
          minHeight: t.z(small ? 34 : 44),
          paddingHorizontal: t.z(small ? 10 : 16),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          overflow: 'hidden',
        },
        flex ? { flex: 1 } : null,
        t.css.button,
        variant === 'primary' ? t.css['button-primary'] : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        icon && <Ionicons name={icon} size={t.z(small ? 16 : 18)} color={fg} />
      )}
      {!!label && (
        <Text numberOfLines={1} style={[{ color: fg, fontWeight: '700', fontSize: t.font(small ? 13 : 14) }, t.css['button-text']]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function IconBtn({
  icon,
  onPress,
  color,
  label,
  size = 20,
  disabled,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  label: string;
  size?: number;
  disabled?: boolean;
}) {
  const { theme: t, haptic } = useSettings();
  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress?.();
      }}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: t.accentSoft, borderless: true, radius: 20 }}
      style={({ pressed }) => ({ padding: 7, borderRadius: 999, opacity: disabled ? 0.35 : pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={t.z(size)} color={color ?? t.textMuted} />
    </Pressable>
  );
}

/* ---------- Interrupteurs & sélecteurs ---------- */

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  icon,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon?: IconName;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}
    >
      {icon && <Ionicons name={icon} size={20} color={t.textMuted} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: t.font(15), fontWeight: '600' }}>{label}</Text>
        {!!description && <Text style={{ color: t.textMuted, fontSize: t.font(12), marginTop: 2 }}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: t.border, true: t.accentSoft }}
        thumbColor={value ? t.accent : t.textFaint}
      />
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
}) {
  const { theme: t, haptic } = useSettings();
  const surface = useContext(SurfaceContext);
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: surface === 'surface2' ? t.surface : t.surface2, borderRadius: t.radiusSm, padding: 3, gap: 3 }, t.css.segmented]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              haptic('light');
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: t.z(36),
              borderRadius: Math.max(3, t.radiusSm - 3),
              backgroundColor: active ? t.accent : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 5,
              paddingHorizontal: 6,
            }}
          >
            {o.icon && <Ionicons name={o.icon} size={t.z(15)} color={active ? t.onAccent : t.textMuted} />}
            <Text
              numberOfLines={1}
              style={{ color: active ? t.onAccent : t.textMuted, fontWeight: '700', fontSize: t.font(13) }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  color,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          borderRadius: 999,
          paddingHorizontal: t.z(12),
          minHeight: t.z(32),
          backgroundColor: selected ? (color ?? t.accent) : t.surface2,
          borderWidth: 1,
          borderColor: selected ? (color ?? t.accent) : t.border,
        },
        t.css.chip,
      ]}
    >
      {icon && <Ionicons name={icon} size={14} color={selected ? t.onAccent : t.textMuted} />}
      <Text style={{ color: selected ? t.onAccent : t.text, fontSize: t.font(13), fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/* ---------- Avatar avec repli ---------- */

export function Avatar({
  uri,
  name,
  size = 40,
  shape = 'circle',
}: {
  uri?: string | null;
  name?: string;
  size?: number;
  shape?: 'circle' | 'rounded' | 'square';
}) {
  const t = useTheme();
  const br = shape === 'circle' ? size / 2 : shape === 'rounded' ? size * 0.28 : size * 0.08;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const initials = Array.from((name || '?').trim())[0]?.toUpperCase() ?? '?';
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: br, backgroundColor: t.surface2 }}
      />
    );
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: br, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: t.onAccent, fontWeight: '800', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/* ---------- Feuille modale (bottom sheet) ---------- */

export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
  full,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  full?: boolean;
}) {
  const { theme: t, base } = useSettings();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} accessibilityLabel="Fermer" />
        <View
          style={[
            {
              backgroundColor: base.bg,
              borderTopLeftRadius: t.radius + 6,
              borderTopRightRadius: t.radius + 6,
              maxHeight: full ? '94%' : '86%',
              height: full ? '94%' : undefined,
              paddingBottom: insets.bottom + 8,
            },
            t.css.sheet,
          ]}
        >
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.border }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ flex: 1, color: t.text, fontSize: t.font(18), fontWeight: '800' }}>{title}</Text>
            <IconBtn icon="close" label="Fermer" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: t.gap }}
          >
            {children}
          </ScrollView>
          {footer && <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- Toasts ---------- */

type ToastKind = 'info' | 'success' | 'error';
const ToastContext = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (msg: string, kind: ToastKind = 'info') => {
      setToast({ msg, kind });
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(
        () => Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null)),
        kind === 'error' ? 5000 : 2600,
      );
    },
    [anim],
  );

  const color = toast?.kind === 'error' ? t.danger : toast?.kind === 'success' ? t.success : t.accent;
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: insets.bottom + 84,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          }}
        >
          <View
            style={{
              backgroundColor: t.bgAlt,
              borderRadius: t.radius,
              borderLeftWidth: 4,
              borderLeftColor: color,
              padding: 14,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'center',
              elevation: 8,
              shadowColor: '#000',
              shadowOpacity: 0.3,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Ionicons
              name={toast.kind === 'error' ? 'alert-circle' : toast.kind === 'success' ? 'checkmark-circle' : 'information-circle'}
              size={20}
              color={color}
            />
            <Text style={{ color: t.text, flex: 1, fontSize: t.font(14) }}>{toast.msg}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

/* ---------- Ligne de liste (paramètres, navigateur bot) ---------- */

export function ListRow({
  title,
  subtitle,
  icon,
  left,
  right,
  onPress,
  selected,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: t.accentSoft }}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        minHeight: 52,
        borderRadius: t.radiusSm,
        backgroundColor: selected ? t.accentSoft : pressed ? t.surface2 : 'transparent',
      })}
    >
      {left ?? (icon && <Ionicons name={icon} size={20} color={selected ? t.accent : t.textMuted} />)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontSize: t.font(15), fontWeight: '600' }}>
          {title}
        </Text>
        {!!subtitle && (
          <Text numberOfLines={2} style={{ color: t.textMuted, fontSize: t.font(12), marginTop: 2 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right ?? (onPress && <Ionicons name="chevron-forward" size={18} color={t.textFaint} />)}
    </Pressable>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 28, gap: 8 }}>
      <Ionicons name={icon} size={40} color={t.textFaint} />
      <Text style={{ color: t.text, fontWeight: '700', fontSize: t.font(16), textAlign: 'center' }}>{title}</Text>
      {!!text && <Text style={{ color: t.textMuted, textAlign: 'center', fontSize: t.font(13) }}>{text}</Text>}
      {action}
    </View>
  );
}

/* ---------- Curseur (slider) ---------- */

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  icon,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  icon?: IconName;
}) {
  const { theme: t, haptic } = useSettings();
  const [w, setW] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;
  const ratio = (shown - min) / (max - min);
  const toValue = (x: number) => {
    const r = Math.min(1, Math.max(0, x / (w || 1)));
    const raw = min + r * (max - min);
    return Math.round(Math.round(raw / step) * step * 1000) / 1000;
  };
  const thumb = t.z(24);
  const set = (v: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(v / step) * step));
    haptic('light');
    onChange(Math.round(clamped * 1000) / 1000);
  };
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon && <Ionicons name={icon} size={t.z(18)} color={t.textMuted} />}
        <Text style={[{ flex: 1, color: t.text, fontSize: t.font(14), fontWeight: '600' }, t.css.label]}>{label}</Text>
        <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.font(13), minWidth: 44, textAlign: 'right' }}>
          {format ? format(shown) : String(shown)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <IconBtn icon="remove" label={`Diminuer ${label}`} size={16} onPress={() => set(value - step)} disabled={value <= min} />
        <View
          style={{ flex: 1, height: thumb + 12, justifyContent: 'center' }}
          onLayout={(e) => setW(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => setDrag(toValue(e.nativeEvent.locationX))}
          onResponderMove={(e) => setDrag(toValue(e.nativeEvent.locationX))}
          onResponderRelease={() => {
            if (drag !== null) onChange(drag);
            setDrag(null);
          }}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value }}
        >
          <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2 }}>
            <View style={{ width: `${ratio * 100}%`, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: Math.max(0, ratio * w - thumb / 2),
              width: thumb,
              height: thumb,
              borderRadius: thumb / 2,
              backgroundColor: t.accent,
              borderWidth: 3,
              borderColor: '#fff',
              elevation: 3,
            }}
          />
        </View>
        <IconBtn icon="add" label={`Augmenter ${label}`} size={16} onPress={() => set(value + step)} disabled={value >= max} />
      </View>
    </View>
  );
}

/* ---------- Modale centrée (fond flouté) ---------- */

/**
 * Fenêtre modale compacte, centrée : le reste de l'app reste visible en arrière-plan, flouté.
 * La taille s'adapte au contenu et à l'écran (téléphone, paysage, tablette).
 */
export function Dialog({
  visible,
  onClose,
  title,
  icon,
  children,
  footer,
  maxWidth = 520,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}) {
  const { theme: t, base } = useSettings();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(0.94)).current;
  useEffect(() => {
    if (visible) {
      scale.setValue(0.94);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start();
    }
  }, [visible, scale]);
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <BlurView
        intensity={45}
        tint={base.dark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Pressable
        onPress={onClose}
        accessibilityLabel="Fermer"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: base.dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.15)' }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingHorizontal: 16 }}
      >
        <Animated.View
          style={[
            {
              width: Math.min(width - 32, maxWidth),
              maxHeight: Math.min(height * 0.78, 680),
              backgroundColor: base.bgAlt,
              borderRadius: t.radius + 6,
              borderWidth: 1,
              borderColor: t.border,
              overflow: 'hidden',
              elevation: 16,
              shadowColor: '#000',
              shadowOpacity: 0.35,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 10 },
              transform: [{ scale }],
            },
            t.css.sheet,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            {icon && <Ionicons name={icon} size={t.z(20)} color={t.accent} />}
            <Text style={{ flex: 1, color: t.text, fontSize: t.font(17), fontWeight: '800' }}>{title}</Text>
            <IconBtn icon="close" label="Fermer" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: t.gap }}>
            {children}
          </ScrollView>
          {footer && <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.border }}>{footer}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
