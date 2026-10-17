import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import type { AppSettings, MessageStyle, WallpaperSettings } from '../types';
import { PALETTES, type Palette } from '../theme/themes';
import { compileSheets, paletteOverrides, varsToRules } from '../theme/css';
import { resolveLanguage, setLanguage } from '../i18n';
import { readableOn, shade, withAlpha } from '../utils/parse';

const KEY = 'fluxerhooks:settings:v1';
const BOT_KEY = 'fluxerhooks_bot_token';
const USER_KEY = 'fluxerhooks_user_token';

export const DEFAULT_WALLPAPER: WallpaperSettings = { uri: null, dim: 0.55, blur: 0, surfaceOpacity: 0.86, tint: 'black' };

export const DEFAULT_MESSAGE_STYLE: MessageStyle = {
  avatarShape: 'circle',
  avatarSize: 40,
  fontSize: 15,
  showTimestamps: true,
  showBotTag: true,
  bubbles: false,
  spacing: 'normal',
  embedMaxWidth: 520,
  embedBarWidth: 4,
  groupMessages: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accent: '#4641D9',
  fontScale: 1,
  radius: 12,
  density: 'comfortable',
  previewDisplay: 'cozy',
  splitView: 'auto',
  confirmBeforeSend: false,
  haptics: true,
  autoCollapseSent: false,
  instance: 'https://fluxer.app',
  showCounters: true,
  zoom: 1,
  wallpaper: DEFAULT_WALLPAPER,
  messageStyle: DEFAULT_MESSAGE_STYLE,
  customCss: {},
  themeVars: {},
  language: 'system',
  botPresence: { autoStart: true, status: 'online', text: '' },
  customCssEnabled: true,
  recentColors: [],
};

type StyleRules = Record<string, Record<string, string | number>>;

export interface Theme extends Palette {
  accent: string;
  accentSoft: string;
  accentPressed: string;
  onAccent: string;
  radius: number;
  radiusSm: number;
  gap: number; // espacement de base des conteneurs
  pad: number; // padding interne des boxes
  zoom: number;
  /** Taille de police tenant compte du texte et du zoom. */
  font: (size: number) => number;
  /** Dimension (icônes, hauteurs) tenant compte du zoom. */
  z: (size: number) => number;
  hasWallpaper: boolean;
  msg: MessageStyle;
  /** Styles personnalisés compilés (sélecteur → style RN). */
  css: StyleRules;
}

/** Le CSS avancé l'emporte sur les variables. */
function mergeRules(a: StyleRules, b: StyleRules): StyleRules {
  const out: StyleRules = { ...a };
  Object.entries(b).forEach(([k, v]) => (out[k] = { ...(out[k] ?? {}), ...v }));
  return out;
}

function buildTheme(base: Palette, s: AppSettings): Theme {
  // Couleurs essentielles personnalisées : elles remplacent celles de la palette du thème.
  const p: Palette = s.customCssEnabled ? { ...base, ...paletteOverrides(s.themeVars) } : base;
  const compact = s.density === 'compact';
  const zoom = Math.min(1.4, Math.max(0.8, s.zoom || 1));
  const wp = s.wallpaper ?? DEFAULT_WALLPAPER;
  const hasWallpaper = !!wp.uri;
  // Avec un fond d'écran, les conteneurs deviennent légèrement translucides.
  const a = (c: string) => (hasWallpaper ? withAlpha(c, wp.surfaceOpacity) : c);
  return {
    ...p,
    bg: hasWallpaper ? 'transparent' : p.bg,
    bgAlt: a(p.bgAlt),
    surface: a(p.surface),
    surface2: a(p.surface2),
    preview: a(p.preview),
    embedBg: a(p.embedBg),
    accent: s.accent,
    accentSoft: withAlpha(s.accent, p.dark ? 0.22 : 0.14),
    accentPressed: shade(s.accent, -0.15),
    onAccent: readableOn(s.accent),
    radius: s.radius,
    radiusSm: Math.max(4, Math.round(s.radius * 0.6)),
    gap: Math.round((compact ? 8 : 12) * zoom),
    pad: Math.round((compact ? 10 : 14) * zoom),
    zoom,
    font: (size: number) => Math.round(size * s.fontScale * zoom * 10) / 10,
    z: (size: number) => Math.round(size * zoom),
    hasWallpaper,
    msg: { ...DEFAULT_MESSAGE_STYLE, ...(s.messageStyle ?? {}) },
    css: s.customCssEnabled ? mergeRules(varsToRules(s.themeVars), compileSheets(s.customCss ?? {}).rules) : {},
  };
}

interface Ctx {
  settings: AppSettings;
  theme: Theme;
  /** Palette opaque d'origine (utile pour le fond réel quand un fond d'écran est actif). */
  base: Palette;
  ready: boolean;
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
  botToken: string;
  setBotToken: (t: string) => Promise<void>;
  userToken: string;
  setUserToken: (t: string) => Promise<void>;
  haptic: (kind?: 'light' | 'success' | 'error' | 'warning') => void;
  pushRecentColor: (c: number) => void;
}

const SettingsContext = createContext<Ctx | null>(null);

async function saveSecret(key: string, v: string) {
  try {
    if (v) await SecureStore.setItemAsync(key, v);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // Keystore indisponible : la valeur reste en mémoire pour la session.
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [botToken, setBotTokenState] = useState('');
  const [userToken, setUserTokenState] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          setSettings({
            ...DEFAULT_SETTINGS,
            ...saved,
            wallpaper: { ...DEFAULT_WALLPAPER, ...(saved.wallpaper ?? {}) },
            messageStyle: { ...DEFAULT_MESSAGE_STYLE, ...(saved.messageStyle ?? {}) },
            botPresence: { ...DEFAULT_SETTINGS.botPresence, ...(saved.botPresence ?? {}) },
          });
        }
        const t = await SecureStore.getItemAsync(BOT_KEY);
        if (t) setBotTokenState(t);
        const u = await SecureStore.getItemAsync(USER_KEY);
        if (u) setUserTokenState(u);
      } catch {
        // stockage indisponible : on garde les valeurs par défaut
      }
      setReady(true);
    })();
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings((prev) => {
      // On garde les couleurs récentes et l'instance : ce ne sont pas des réglages d'apparence.
      const next = { ...DEFAULT_SETTINGS, recentColors: prev.recentColors, instance: prev.instance };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setBotToken = useCallback(async (t: string) => {
    const v = t.trim().replace(/^Bot\s+/i, '');
    setBotTokenState(v);
    await saveSecret(BOT_KEY, v);
  }, []);

  const setUserToken = useCallback(async (t: string) => {
    const v = t.trim();
    setUserTokenState(v);
    await saveSecret(USER_KEY, v);
  }, []);

  const pushRecentColor = useCallback(
    (c: number) => update({ recentColors: [c, ...settings.recentColors.filter((x) => x !== c)].slice(0, 16) }),
    [settings.recentColors, update],
  );

  const haptic = useCallback(
    (kind: 'light' | 'success' | 'error' | 'warning' = 'light') => {
      if (!settings.haptics) return;
      try {
        if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        else
          Haptics.notificationAsync(
            kind === 'success'
              ? Haptics.NotificationFeedbackType.Success
              : kind === 'error'
                ? Haptics.NotificationFeedbackType.Error
                : Haptics.NotificationFeedbackType.Warning,
          );
      } catch {
        // pas de vibreur
      }
    },
    [settings.haptics],
  );

  const base = useMemo(() => {
    const name = settings.theme === 'system' ? (scheme === 'light' ? 'light' : 'dark') : settings.theme;
    // Palette opaque (fenêtres, barre système) avec les couleurs essentielles personnalisées.
    return settings.customCssEnabled ? { ...PALETTES[name], ...paletteOverrides(settings.themeVars) } : PALETTES[name];
  }, [settings.theme, scheme, settings.customCssEnabled, settings.themeVars]);
  // Langue appliquée avant le rendu des écrans (les composants traduisent via tr()).
  setLanguage(resolveLanguage(settings.language));
  const theme = useMemo(() => buildTheme(base, settings), [base, settings]);

  const value = useMemo(
    () => ({ settings, theme, base, ready, update, reset, botToken, setBotToken, userToken, setUserToken, haptic, pushRecentColor }),
    [settings, theme, base, ready, update, reset, botToken, setBotToken, userToken, setUserToken, haptic, pushRecentColor],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const c = useContext(SettingsContext);
  if (!c) throw new Error('useSettings hors SettingsProvider');
  return c;
}

export const useTheme = () => useSettings().theme;

/** Style personnalisé d'un sélecteur (vide si aucun). */
export function useCss(selector: string): any {
  return useSettings().theme.css[selector];
}
