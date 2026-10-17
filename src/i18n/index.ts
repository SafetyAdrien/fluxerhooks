/**
 * Traductions de l'interface. Les textes français servent de clés : un texte absent d'un
 * dictionnaire reste en français (repli sûr). Les composants de base (Box, Button, Input…)
 * passent leurs libellés par `tr`, ce qui traduit l'essentiel de l'app sans toucher chaque écran.
 */
import en from './en';
import es from './es';
import de from './de';
import it from './it';
import pt from './pt';
import nl from './nl';
import pl from './pl';
import ru from './ru';
import ja from './ja';

export type LangCode = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' | 'nl' | 'pl' | 'ru' | 'ja';

export const LANGUAGES: { code: LangCode; native: string; english: string; flag: string; locale: string }[] = [
  { code: 'fr', native: 'Français', english: 'French', flag: '🇫🇷', locale: 'fr-FR' },
  { code: 'en', native: 'English', english: 'English', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'es', native: 'Español', english: 'Spanish', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'de', native: 'Deutsch', english: 'German', flag: '🇩🇪', locale: 'de-DE' },
  { code: 'it', native: 'Italiano', english: 'Italian', flag: '🇮🇹', locale: 'it-IT' },
  { code: 'pt', native: 'Português (Brasil)', english: 'Portuguese', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'nl', native: 'Nederlands', english: 'Dutch', flag: '🇳🇱', locale: 'nl-NL' },
  { code: 'pl', native: 'Polski', english: 'Polish', flag: '🇵🇱', locale: 'pl-PL' },
  { code: 'ru', native: 'Русский', english: 'Russian', flag: '🇷🇺', locale: 'ru-RU' },
  { code: 'ja', native: '日本語', english: 'Japanese', flag: '🇯🇵', locale: 'ja-JP' },
];

const DICTS: Record<Exclude<LangCode, 'fr'>, Record<string, string>> = { en, es, de, it, pt, nl, pl, ru, ja };

let current: LangCode = 'en';

/** Langue du téléphone, si elle fait partie des langues proposées. */
export function systemLanguage(): LangCode {
  let loc = 'fr';
  try {
    loc = Intl.DateTimeFormat().resolvedOptions().locale || 'fr';
  } catch {
    loc = 'fr';
  }
  const code = loc.slice(0, 2).toLowerCase();
  return (LANGUAGES.find((l) => l.code === code)?.code ?? 'en') as LangCode;
}

export function resolveLanguage(setting: string | undefined): LangCode {
  if (!setting || setting === 'system') return systemLanguage();
  return (LANGUAGES.find((l) => l.code === setting)?.code ?? 'en') as LangCode;
}

export function setLanguage(code: LangCode) {
  current = code;
}

export const currentLanguage = () => current;
export const currentLocale = () => LANGUAGES.find((l) => l.code === current)?.locale ?? 'en-US';

/** Traduit un texte français ; `{nom}` est remplacé par vars.nom. */
export function tr(s: string, vars?: Record<string, string | number>): string;
export function tr(s: string | undefined | null, vars?: Record<string, string | number>): string | undefined;
export function tr(s: string | undefined | null, vars?: Record<string, string | number>) {
  if (s == null) return s ?? undefined;
  let out = current === 'fr' ? s : (DICTS[current][s] ?? s);
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}
