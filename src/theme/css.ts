/**
 * Mini-moteur « CSS » pour personnaliser l'interface.
 * React Native n'a pas de CSS : on accepte une syntaxe CSS simple
 *   button { border-radius: 20px; background: #E11D48; }
 * qu'on convertit en objets de style RN, appliqués par sélecteur.
 */

import type { Palette } from './themes';

/**
 * Variables de thème façon Fluxer (« Theme colors ») : chaque variable a un nom --css,
 * une valeur couleur ou taille, et s'applique soit à la palette entière, soit à un sélecteur.
 */
export type VarTarget =
  | { palette: keyof Palette }
  | { setting: 'accent' | 'radius' }
  | { selector: string; prop: string; extra?: Record<string, number> };

export interface ThemeVar {
  name: string; // sans les tirets : « background-primary » → --background-primary
  label: string;
  kind: 'color' | 'size';
  target: VarTarget;
  hint?: string;
  /** Valeur actuelle par défaut (affichée tant que la variable n'est pas personnalisée). */
  def: (t: { [k: string]: any }) => string | number;
  min?: number;
  max?: number;
}

export interface CssCategory {
  key: string;
  label: string;
  icon: string;
  /** Titre de section, comme « Essential colors » chez Fluxer. */
  section: string;
  vars: ThemeVar[];
  selectors: { name: string; description: string }[];
  example: string;
}

const col = (name: string, label: string, target: VarTarget, def: ThemeVar['def'], hint?: string): ThemeVar => ({ name, label, kind: 'color', target, def, hint });
const size = (name: string, label: string, target: VarTarget, def: ThemeVar['def'], min = 0, max = 40, hint?: string): ThemeVar => ({ name, label, kind: 'size', target, def, min, max, hint });

/** Couleurs essentielles : modifient la palette, donc toute l'application d'un coup. */
export const ESSENTIAL: CssCategory = {
  key: 'essential',
  label: 'Essentiel',
  icon: 'color-palette-outline',
  section: 'Couleurs essentielles',
  selectors: [],
  example: '',
  vars: [
    col('brand-primary', 'Couleur principale', { setting: 'accent' }, (t) => t.accent, 'Boutons principaux, éléments actifs et liens d’action.'),
    col('background-primary', 'Fond principal', { palette: 'bg' }, (t) => t.bg, 'Avec un fond d’écran, tu ne verras pas cette couleur.'),
    col('background-secondary', 'Fond secondaire', { palette: 'bgAlt' }, (t) => t.bgAlt, 'Barre supérieure, onglets et barre d’action.'),
    col('background-surface', 'Conteneurs', { palette: 'surface' }, (t) => t.surface),
    col('background-input', 'Champs et boutons', { palette: 'surface2' }, (t) => t.surface2),
    col('border-color', 'Bordures', { palette: 'border' }, (t) => t.border),
    col('text-primary', 'Texte principal', { palette: 'text' }, (t) => t.text),
    col('text-muted', 'Texte secondaire', { palette: 'textMuted' }, (t) => t.textMuted),
    col('chat-background', 'Fond de l’aperçu', { palette: 'preview' }, (t) => t.preview, 'Le fond derrière les messages, comme un salon Fluxer.'),
    col('embed-background', 'Fond des embeds', { palette: 'embedBg' }, (t) => t.embedBg),
    col('text-link', 'Liens', { palette: 'link' }, (t) => t.link),
    col('mention-background', 'Fond des mentions', { palette: 'mentionBg' }, (t) => t.mentionBg),
    col('mention-text', 'Texte des mentions', { palette: 'mentionText' }, (t) => t.mentionText),
    size('radius', 'Arrondi général', { setting: 'radius' }, (t) => t.radius, 4, 20, 'Coins de tous les conteneurs et boutons.'),
  ],
};

export const CSS_CATEGORIES: CssCategory[] = [
  {
    key: 'layout',
    section: 'Structure de l’application',
    vars: [
      col('app-background', 'Fond de l’application', { selector: 'app', prop: 'backgroundColor' }, (t) => t.bg),
      col('header-background', 'Barre supérieure', { selector: 'header', prop: 'backgroundColor' }, (t) => t.bgAlt),
      col('actionbar-background', 'Barre d’action', { selector: 'actionbar', prop: 'backgroundColor' }, (t) => t.bgAlt, 'La barre flottante avec « Envoyer ».'),
      size('actionbar-radius', 'Arrondi de la barre d’action', { selector: 'actionbar', prop: 'borderRadius' }, (t) => t.radius + 4, 0, 40),
      col('sheet-background', 'Fenêtres', { selector: 'sheet', prop: 'backgroundColor' }, (t) => t.bg, 'Paramètres, profil, JSON…'),
    ],
    label: 'Structure',
    icon: 'grid-outline',
    selectors: [
      { name: 'app', description: 'Fond général de l’application' },
      { name: 'header', description: 'Barre supérieure' },
      { name: 'actionbar', description: 'Barre d’action flottante (Envoyer)' },
      { name: 'sheet', description: 'Fenêtres modales (paramètres, JSON…)' },
    ],
    example: 'header {\n  background: #101018;\n  border-bottom-width: 0;\n}\nactionbar {\n  border-radius: 28px;\n}',
  },
  {
    key: 'components',
    section: 'Composants',
    vars: [
      col('box-background', 'Conteneurs', { selector: 'box', prop: 'backgroundColor' }, (t) => t.surface),
      col('box-border', 'Bordure des conteneurs', { selector: 'box', prop: 'borderColor', extra: { borderWidth: 1 } }, (t) => t.border),
      size('box-radius', 'Arrondi des conteneurs', { selector: 'box', prop: 'borderRadius' }, (t) => t.radius, 0, 32),
      col('box-nested-background', 'Conteneurs imbriqués', { selector: 'box-nested', prop: 'backgroundColor' }, (t) => t.surface2),
      col('button-background', 'Boutons', { selector: 'button', prop: 'backgroundColor' }, (t) => t.surface2),
      size('button-radius', 'Arrondi des boutons', { selector: 'button', prop: 'borderRadius' }, (t) => t.radiusSm, 0, 999),
      col('button-primary-background', 'Boutons principaux', { selector: 'button-primary', prop: 'backgroundColor' }, (t) => t.accent),
      col('chip-background', 'Pastilles', { selector: 'chip', prop: 'backgroundColor' }, (t) => t.surface2),
      col('segmented-background', 'Sélecteurs à onglets', { selector: 'segmented', prop: 'backgroundColor' }, (t) => t.surface2),
    ],
    label: 'Composants',
    icon: 'cube-outline',
    selectors: [
      { name: 'box', description: 'Conteneurs (boxes repliables)' },
      { name: 'box-nested', description: 'Conteneurs imbriqués' },
      { name: 'button', description: 'Tous les boutons' },
      { name: 'button-primary', description: 'Boutons principaux' },
      { name: 'chip', description: 'Pastilles (tags…)' },
      { name: 'segmented', description: 'Sélecteurs à onglets' },
    ],
    example: 'box {\n  border-width: 1px;\n  border-color: #4641D9;\n}\nbutton-primary {\n  border-radius: 999px;\n}',
  },
  {
    key: 'text',
    section: 'Texte',
    vars: [
      col('title-color', 'Titres', { selector: 'title', prop: 'color' }, (t) => t.text),
      size('title-size', 'Taille des titres', { selector: 'title', prop: 'fontSize' }, () => 15, 10, 28),
      col('subtitle-color', 'Sous-titres', { selector: 'subtitle', prop: 'color' }, (t) => t.textMuted),
      col('label-color', 'Libellés', { selector: 'label', prop: 'color' }, (t) => t.textMuted),
      col('button-text-color', 'Texte des boutons', { selector: 'button-text', prop: 'color' }, (t) => t.text),
    ],
    label: 'Texte',
    icon: 'text-outline',
    selectors: [
      { name: 'title', description: 'Titres des boxes' },
      { name: 'subtitle', description: 'Sous-titres des boxes' },
      { name: 'label', description: 'Libellés des champs et sections' },
      { name: 'button-text', description: 'Texte des boutons' },
    ],
    example: 'title {\n  letter-spacing: 0.5px;\n  text-transform: uppercase;\n}\nlabel {\n  color: #A9A9D6;\n}',
  },
  {
    key: 'inputs',
    section: 'Champs de saisie',
    vars: [
      col('input-background', 'Fond des champs', { selector: 'input', prop: 'backgroundColor' }, (t) => t.surface2),
      col('input-border', 'Bordure des champs', { selector: 'input', prop: 'borderColor', extra: { borderWidth: 1 } }, (t) => t.border),
      size('input-radius', 'Arrondi des champs', { selector: 'input', prop: 'borderRadius' }, (t) => t.radiusSm, 0, 32),
      col('input-text-color', 'Texte saisi', { selector: 'input-text', prop: 'color' }, (t) => t.text),
      size('input-text-size', 'Taille du texte saisi', { selector: 'input-text', prop: 'fontSize' }, () => 15, 11, 24),
      col('toolbar-background', 'Barre markdown', { selector: 'toolbar', prop: 'backgroundColor' }, () => 'transparent'),
    ],
    label: 'Champs',
    icon: 'create-outline',
    selectors: [
      { name: 'input', description: 'Zone de saisie' },
      { name: 'input-text', description: 'Texte saisi' },
      { name: 'toolbar', description: 'Barre de mise en forme markdown' },
    ],
    example: 'input {\n  border-width: 1px;\n  border-color: #35356A;\n}\ninput-text {\n  font-size: 16px;\n}',
  },
  {
    key: 'preview',
    section: 'Aperçu des messages',
    vars: [
      col('preview-background', 'Fond de l’aperçu', { selector: 'preview', prop: 'backgroundColor' }, (t) => t.preview),
      col('message-name-color', 'Nom de l’auteur', { selector: 'message-name', prop: 'color' }, (t) => t.text),
      col('text-chat', 'Texte des messages', { selector: 'message-text', prop: 'color' }, (t) => t.text),
      col('embed-card-background', 'Cartes d’embed', { selector: 'embed', prop: 'backgroundColor' }, (t) => t.embedBg),
      size('embed-radius', 'Arrondi des embeds', { selector: 'embed', prop: 'borderRadius' }, () => 4, 0, 24),
    ],
    label: 'Aperçu',
    icon: 'eye-outline',
    selectors: [
      { name: 'preview', description: 'Fond de l’aperçu' },
      { name: 'message', description: 'Chaque message' },
      { name: 'message-name', description: 'Nom de l’auteur' },
      { name: 'message-text', description: 'Texte des messages' },
      { name: 'embed', description: 'Cartes d’embed' },
    ],
    example: 'preview {\n  background: #0B0B12;\n}\nembed {\n  border-radius: 12px;\n}',
  },
];

const ALIASES: Record<string, string> = {
  background: 'backgroundColor',
  'background-color': 'backgroundColor',
  'border': 'borderWidth',
  radius: 'borderRadius',
};

const NUMERIC = new Set([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'padding', 'paddingHorizontal', 'paddingVertical', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'margin', 'marginHorizontal', 'marginVertical', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'borderRadius', 'borderWidth', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'fontSize', 'lineHeight', 'letterSpacing', 'opacity', 'gap', 'rowGap', 'columnGap', 'elevation', 'flex',
  'top', 'bottom', 'left', 'right', 'shadowOpacity', 'shadowRadius', 'zIndex',
]);

const ALLOWED_STRINGS = new Set([
  'backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor',
  'fontWeight', 'fontStyle', 'textTransform', 'textAlign', 'textDecorationLine', 'borderStyle', 'fontFamily',
  'alignItems', 'justifyContent', 'flexDirection', 'flexWrap', 'overflow', 'shadowColor', 'alignSelf',
]);

const camel = (s: string) => s.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export interface CssParseResult {
  rules: Record<string, Record<string, string | number>>;
  errors: string[];
}

export function parseCss(src: string): CssParseResult {
  const rules: CssParseResult['rules'] = {};
  const errors: string[] = [];
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([a-z0-9\-,\s]+)\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(clean))) {
    consumed += m[0].length;
    const selectors = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const style: Record<string, string | number> = {};
    m[2].split(';').forEach((decl) => {
      const d = decl.trim();
      if (!d) return;
      const i = d.indexOf(':');
      if (i < 0) return void errors.push(`« ${d} » : il manque « : »`);
      const rawProp = d.slice(0, i).trim().toLowerCase();
      let value = d.slice(i + 1).trim().replace(/\s*!important$/, '');
      const prop = ALIASES[rawProp] ?? camel(rawProp);
      if (NUMERIC.has(prop)) {
        const n = parseFloat(value.replace(/px$/, ''));
        if (isNaN(n)) return void errors.push(`${rawProp} : valeur numérique attendue (${value})`);
        style[prop] = n;
      } else if (ALLOWED_STRINGS.has(prop)) {
        if (prop === 'fontWeight' && /^\d+$/.test(value)) value = String(Math.round(Number(value) / 100) * 100);
        style[prop] = value;
      } else {
        errors.push(`propriété non prise en charge : ${rawProp}`);
      }
    });
    selectors.forEach((sel) => {
      rules[sel] = { ...(rules[sel] ?? {}), ...style };
    });
  }
  if (clean.replace(/\s/g, '').length && !consumed) errors.push('Aucune règle valide : utilise la forme  sélecteur { propriété: valeur; }');
  return { rules, errors };
}

export function compileSheets(sheets: Record<string, string>): CssParseResult {
  const all: CssParseResult = { rules: {}, errors: [] };
  Object.values(sheets).forEach((s) => {
    const r = parseCss(s || '');
    Object.entries(r.rules).forEach(([k, v]) => (all.rules[k] = { ...(all.rules[k] ?? {}), ...v }));
    all.errors.push(...r.errors);
  });
  return all;
}

/* ---------- Variables → styles ---------- */

export type ThemeVars = Record<string, string | number>;
export const ALL_VARS: ThemeVar[] = [ESSENTIAL, ...CSS_CATEGORIES].flatMap((c) => c.vars);
const VAR_BY_NAME = new Map(ALL_VARS.map((v) => [v.name, v]));

export const isColorValue = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim()) || v.trim() === 'transparent';

/** Valeurs valides seulement (une saisie en cours comme « #12 » est ignorée). */
function validEntries(vars: ThemeVars | undefined) {
  return Object.entries(vars ?? {}).flatMap(([name, value]) => {
    const def = VAR_BY_NAME.get(name);
    if (!def) return [];
    if (def.kind === 'color' && (typeof value !== 'string' || !isColorValue(value))) return [];
    if (def.kind === 'size' && (typeof value !== 'number' || !isFinite(value))) return [];
    return [[def, value] as const];
  });
}

export function paletteOverrides(vars: ThemeVars | undefined): Partial<Palette> {
  const out: Record<string, string> = {};
  validEntries(vars).forEach(([d, v]) => {
    if ('palette' in d.target) out[d.target.palette] = String(v);
  });
  return out as Partial<Palette>;
}

export function settingOverrides(vars: ThemeVars | undefined): { accent?: string; radius?: number } {
  const out: { accent?: string; radius?: number } = {};
  validEntries(vars).forEach(([d, v]) => {
    if ('setting' in d.target) (out as any)[d.target.setting] = v;
  });
  return out;
}

export function varsToRules(vars: ThemeVars | undefined): CssParseResult['rules'] {
  const rules: CssParseResult['rules'] = {};
  validEntries(vars).forEach(([d, v]) => {
    if (!('selector' in d.target)) return;
    const { selector, prop, extra } = d.target;
    rules[selector] = { ...(rules[selector] ?? {}), ...(extra ?? {}), [prop]: v };
  });
  return rules;
}

/** Exporte les variables en vrai CSS (:root { --nom: valeur; }) pour les partager. */
export function varsToCssText(vars: ThemeVars): string {
  const lines = validEntries(vars).map(([d, v]) => `  --${d.name}: ${d.kind === 'size' ? `${v}px` : v};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

/** Lit un bloc :root { --nom: valeur; } (ou une simple liste de déclarations). */
export function parseCssVars(text: string): ThemeVars {
  const out: ThemeVars = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;}\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const d = VAR_BY_NAME.get(m[1].toLowerCase());
    if (!d) continue;
    const raw = m[2].trim();
    if (d.kind === 'size') {
      const n = parseFloat(raw);
      if (isFinite(n)) out[d.name] = n;
    } else if (isColorValue(raw)) out[d.name] = raw.toUpperCase();
  }
  return out;
}
