/**
 * Mini-moteur « CSS » pour personnaliser l'interface.
 * React Native n'a pas de CSS : on accepte une syntaxe CSS simple
 *   button { border-radius: 20px; background: #E11D48; }
 * qu'on convertit en objets de style RN, appliqués par sélecteur.
 */

export interface CssCategory {
  key: string;
  label: string;
  icon: string;
  selectors: { name: string; description: string }[];
  example: string;
}

export const CSS_CATEGORIES: CssCategory[] = [
  {
    key: 'layout',
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
