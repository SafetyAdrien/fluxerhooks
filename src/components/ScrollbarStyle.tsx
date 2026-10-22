import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useSettings } from '../state/settings';
import { withAlpha } from '../utils/parse';

/**
 * Barres de défilement au style de l'app (Desktop et navigateur) : fines, arrondies, aux couleurs
 * du thème, accentuées au survol. Sur Android, le thème natif s'en charge (plugins/withScrollbar.js).
 */
export function ScrollbarStyle() {
  const { theme: t } = useSettings();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let el = document.getElementById('fh-scrollbar') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'fh-scrollbar';
      document.head.appendChild(el);
    }
    const thumb = withAlpha(t.textFaint, 0.45);
    const hover = withAlpha(t.accent, 0.8);
    el.textContent = `
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb { background-color: ${thumb}; border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; min-height: 36px; }
::-webkit-scrollbar-thumb:hover { background-color: ${hover}; border-width: 2px; }
::-webkit-scrollbar-thumb:active { background-color: ${t.accent}; border-width: 2px; }
::-webkit-scrollbar-button { display: none; height: 0; width: 0; }
`;
  }, [t.textFaint, t.accent]);
  return null;
}
