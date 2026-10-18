import type { ThemeName } from '../types';

export interface Palette {
  name: Exclude<ThemeName, 'system'>;
  label: string;
  dark: boolean;
  bg: string; // fond de l'app
  bgAlt: string; // barres, onglets
  surface: string; // conteneurs / boxes
  surface2: string; // champs de saisie
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  preview: string; // fond de l'aperçu (comme un salon Fluxer)
  embedBg: string;
  codeBg: string;
  mentionBg: string;
  mentionText: string;
  link: string;
  danger: string;
  success: string;
  warning: string;
}

export const PALETTES: Record<Exclude<ThemeName, 'system'>, Palette> = {
  dark: {
    name: 'dark',
    label: 'Sombre',
    dark: true,
    bg: '#16171B',
    bgAlt: '#1C1D22',
    surface: '#222329',
    surface2: '#2B2C33',
    border: '#34353D',
    text: '#ECEDF2',
    textMuted: '#A3A6B1',
    textFaint: '#70737E',
    preview: '#1E1F24',
    embedBg: '#26272D',
    codeBg: '#15161A',
    mentionBg: 'rgba(88,101,242,0.25)',
    mentionText: '#C9CDFB',
    link: '#00A8FC',
    danger: '#F0475B',
    success: '#2DC770',
    warning: '#F0B232',
  },
  light: {
    name: 'light',
    label: 'Clair',
    dark: false,
    bg: '#F2F3F7',
    bgAlt: '#FFFFFF',
    surface: '#FFFFFF',
    surface2: '#EDEEF2',
    border: '#DCDEE5',
    text: '#17181C',
    textMuted: '#5A5E6B',
    textFaint: '#8C909C',
    preview: '#FFFFFF',
    embedBg: '#F3F4F7',
    codeBg: '#EAEBEF',
    mentionBg: 'rgba(88,101,242,0.15)',
    mentionText: '#3C46C9',
    link: '#006CE7',
    danger: '#D92C40',
    success: '#1F9D55',
    warning: '#C98A0B',
  },
  amoled: {
    name: 'amoled',
    label: 'Noir AMOLED',
    dark: true,
    bg: '#000000',
    bgAlt: '#08080A',
    surface: '#0F0F12',
    surface2: '#18181C',
    border: '#24242A',
    text: '#F2F2F5',
    textMuted: '#A0A0AA',
    textFaint: '#6A6A74',
    preview: '#050506',
    embedBg: '#121215',
    codeBg: '#0B0B0D',
    mentionBg: 'rgba(88,101,242,0.25)',
    mentionText: '#C9CDFB',
    link: '#2DB4FF',
    danger: '#FF4D61',
    success: '#30D679',
    warning: '#FFC23D',
  },
  fluxer: {
    name: 'fluxer',
    label: 'Fluxer Indigo',
    dark: true,
    bg: '#12122A',
    bgAlt: '#181838',
    surface: '#1F1F45',
    surface2: '#292955',
    border: '#35356A',
    text: '#EEEEFF',
    textMuted: '#A9A9D6',
    textFaint: '#7474A8',
    preview: '#17173A',
    embedBg: '#22224A',
    codeBg: '#101026',
    mentionBg: 'rgba(124,120,255,0.3)',
    mentionText: '#D4D2FF',
    link: '#7DB7FF',
    danger: '#FF5A72',
    success: '#3DDC97',
    warning: '#FFC857',
  },
  midnight: {
    name: 'midnight',
    label: 'Minuit',
    dark: true,
    bg: '#0B1220',
    bgAlt: '#0F1829',
    surface: '#152036',
    surface2: '#1C2943',
    border: '#263553',
    text: '#E6EDF7',
    textMuted: '#9AA9C2',
    textFaint: '#677792',
    preview: '#111B2E',
    embedBg: '#172339',
    codeBg: '#0A111E',
    mentionBg: 'rgba(56,139,253,0.25)',
    mentionText: '#BFD8FF',
    link: '#58A6FF',
    danger: '#F85166',
    success: '#3FB950',
    warning: '#D29922',
  },
};

export const ACCENTS = ['#4641D9', '#5865F2', '#7C3AED', '#DB2777', '#E11D48', '#EA580C', '#16A34A', '#0891B2', '#0EA5E9', '#64748B'];

/** Couleurs prédéfinies pour la barre latérale des embeds. */
export const EMBED_COLORS = [
  0x4641d9, 0x5865f2, 0x57f287, 0xfee75c, 0xeb459e, 0xed4245, 0xf47b67, 0x1abc9c, 0x3498db, 0x9b59b6,
  0xe67e22, 0x95a5a6, 0x2c2f33, 0xffffff,
];
