import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import type { AppSettings } from '../types';
import { PALETTES, type Palette } from '../theme/themes';
import { readableOn, shade, withAlpha } from '../utils/parse';

const KEY = 'fluxerhooks:settings:v1';
const BOT_KEY = 'fluxerhooks_bot_token';

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
};

export interface Theme extends Palette {
  accent: string;
  accentSoft: string;
  accentPressed: string;
  onAccent: string;
  radius: number;
  radiusSm: number;
  gap: number; // espacement de base des conteneurs
  pad: number; // padding interne des boxes
  font: (size: number) => number;
}

function buildTheme(p: Palette, s: AppSettings): Theme {
  const compact = s.density === 'compact';
  return {
    ...p,
    accent: s.accent,
    accentSoft: withAlpha(s.accent, p.dark ? 0.22 : 0.14),
    accentPressed: shade(s.accent, -0.15),
    onAccent: readableOn(s.accent),
    radius: s.radius,
    radiusSm: Math.max(4, Math.round(s.radius * 0.6)),
    gap: compact ? 8 : 12,
    pad: compact ? 10 : 14,
    font: (size: number) => Math.round(size * s.fontScale * 10) / 10,
  };
}

interface Ctx {
  settings: AppSettings;
  theme: Theme;
  ready: boolean;
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
  botToken: string;
  setBotToken: (t: string) => Promise<void>;
  haptic: (kind?: 'light' | 'success' | 'error' | 'warning') => void;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [botToken, setBotTokenState] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        const t = await SecureStore.getItemAsync(BOT_KEY);
        if (t) setBotTokenState(t);
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
    setSettings(DEFAULT_SETTINGS);
    AsyncStorage.setItem(KEY, JSON.stringify(DEFAULT_SETTINGS)).catch(() => {});
  }, []);

  const setBotToken = useCallback(async (t: string) => {
    const v = t.trim().replace(/^Bot\s+/i, '');
    setBotTokenState(v);
    try {
      if (v) await SecureStore.setItemAsync(BOT_KEY, v);
      else await SecureStore.deleteItemAsync(BOT_KEY);
    } catch {
      // Keystore indisponible : le token reste en mémoire pour la session.
    }
  }, []);

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

  const theme = useMemo(() => {
    const name = settings.theme === 'system' ? (scheme === 'light' ? 'light' : 'dark') : settings.theme;
    return buildTheme(PALETTES[name], settings);
  }, [settings, scheme]);

  const value = useMemo(
    () => ({ settings, theme, ready, update, reset, botToken, setBotToken, haptic }),
    [settings, theme, ready, update, reset, botToken, setBotToken, haptic],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const c = useContext(SettingsContext);
  if (!c) throw new Error('useSettings hors SettingsProvider');
  return c;
}

export const useTheme = () => useSettings().theme;
