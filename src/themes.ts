import { Platform } from 'react-native';
import type { HighlightColor, ReaderFont, ReaderSettings, ReaderTheme, ThemeColors } from './types';

export const THEMES: ReaderTheme[] = [
  {
    id: 'original',
    name: 'Original',
    light: { bg: '#ffffff', fg: '#1c1c1e', link: '#0a60ff' },
    dark: { bg: '#000000', fg: '#f2f2f7', link: '#64a8ff' }
  },
  {
    id: 'quiet',
    name: 'Quiet',
    light: { bg: '#e8e8ea', fg: '#58585c', link: '#3a6ea5' },
    dark: { bg: '#121212', fg: '#8e8e93', link: '#6c9bd1' }
  },
  {
    id: 'paper',
    name: 'Paper',
    light: { bg: '#f6f0e1', fg: '#3b3226', link: '#8a5a2b' },
    dark: { bg: '#1d1d1f', fg: '#e9e0cd', link: '#d6a86a' }
  },
  {
    id: 'bold',
    name: 'Bold',
    bold: true,
    light: { bg: '#ffffff', fg: '#000000', link: '#0a60ff' },
    dark: { bg: '#000000', fg: '#ffffff', link: '#64a8ff' }
  },
  {
    id: 'calm',
    name: 'Calm',
    light: { bg: '#ece1c9', fg: '#4a3f2c', link: '#7a5a1f' },
    dark: { bg: '#3d372d', fg: '#f0e7d3', link: '#e0b66f' }
  },
  {
    id: 'focus',
    name: 'Focus',
    light: { bg: '#f3efe2', fg: '#2d2a24', link: '#9a4b1c' },
    dark: { bg: '#1a1913', fg: '#e8e2d0', link: '#d98f5a' }
  }
];

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

/** Font stacks. iOS ships most of these, on Android the stacks fall back to the system serif / sans. */
export const FONTS: ReaderFont[] = [
  { id: 'original', name: 'Original', css: 'original' },
  { id: 'system', name: 'System', css: "-apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" },
  { id: 'newyork', name: 'New York', css: "ui-serif, 'New York', Georgia, serif" },
  { id: 'athelas', name: 'Athelas', css: "Athelas, Georgia, serif" },
  { id: 'charter', name: 'Charter', css: "Charter, 'Bitstream Charter', Georgia, serif" },
  { id: 'georgia', name: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
  { id: 'iowan', name: 'Iowan', css: "'Iowan Old Style', Georgia, serif" },
  { id: 'palatino', name: 'Palatino', css: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { id: 'seravek', name: 'Seravek', css: "Seravek, 'Avenir Next', -apple-system, sans-serif" },
  { id: 'times', name: 'Times New Roman', css: "'Times New Roman', Times, serif" },
  { id: 'naskh', name: 'Naskh (عربي / پښتو)', css: "'Noto Naskh Arabic', 'Geeza Pro', 'Droid Arabic Naskh', 'Scheherazade New', serif" }
];

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#ffd60a',
  green: '#34c759',
  blue: '#0a84ff',
  pink: '#ff375f',
  purple: '#bf5af2'
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  themeId: 'original',
  appearance: 'device',
  fontId: 'original',
  fontSize: 19,
  bold: false,
  customize: false,
  lineHeight: 1.5,
  letterSpacing: 0,
  wordSpacing: 0,
  margins: 0,
  columns: 'auto',
  justify: false,
  pageTurn: 'slide',
  pageSound: true,
  brightness: 1,
  direction: 'auto'
};

export const getTheme = (id: string): ReaderTheme => THEMES.find((t) => t.id === id) || THEMES[0];
export const getFont = (id: string): ReaderFont => FONTS.find((f) => f.id === id) || FONTS[0];
export const serifFont = SERIF;

export function isDark(settings: ReaderSettings, systemDark: boolean): boolean {
  return settings.appearance === 'device' ? systemDark : settings.appearance === 'dark';
}

export function themeColors(settings: ReaderSettings, systemDark: boolean): ThemeColors {
  const t = getTheme(settings.themeId);
  return isDark(settings, systemDark) ? t.dark : t.light;
}

const BASE_MARGIN = 28;

/** Settings object understood by the WebView engine. */
export function toEngineSettings(settings: ReaderSettings, systemDark: boolean, insets: { top: number; bottom: number; left?: number; right?: number }) {
  const theme = getTheme(settings.themeId);
  const c = themeColors(settings, systemDark);
  const custom = settings.customize;
  return {
    bg: c.bg,
    fg: c.fg,
    link: c.link,
    bold: !!theme.bold || settings.bold,
    fontFamily: getFont(settings.fontId).css,
    fontSize: settings.fontSize,
    lineHeight: custom ? settings.lineHeight : 1.5,
    letterSpacing: custom ? (settings.letterSpacing / 100) * 0.25 : 0,
    wordSpacing: custom ? (settings.wordSpacing / 100) * 0.5 : 0,
    marginX: Math.round(BASE_MARGIN * (1 + (custom ? settings.margins : 0) / 100)),
    columns: settings.columns,
    justify: settings.justify,
    mode: settings.pageTurn,
    direction: settings.direction,
    insets: { top: insets.top + 40, bottom: insets.bottom + 40, left: insets.left || 0, right: insets.right || 0 }
  };
}

export interface ChromeColors {
  /** translucent control background (pills, circles), tinted with the page colour */
  glass: string;
  glassBorder: string;
  /** solid sheet colour and a translucent one for sheets that float over the book */
  sheet: string;
  sheetGlass: string;
  /** rows / cards inside a sheet: a neutral wash that works on any theme */
  card: string;
  text: string;
  subtext: string;
  separator: string;
  /** highlight for the current chapter / selected items */
  accent: string;
  dark: boolean;
}

function mix(hex: string, other: string, amount: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex);
  const b = p(other);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function rgba(hex: string, alpha: number): string {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${v[0]},${v[1]},${v[2]},${alpha})`;
}

/**
 * Chrome (buttons, menus, sheets) is frosted glass tinted with the page colour, so a Calm page gets warm glass and a
 * black page gets dark glass. Text and icons use the neutral text colour of the light / dark variant.
 */
export function chromeColors(colors: ThemeColors, dark: boolean): ChromeColors {
  if (dark) {
    return {
      glass: rgba(mix(colors.bg, '#ffffff', 0.22), 0.4),
      glassBorder: 'rgba(255,255,255,0.16)',
      sheet: mix(colors.bg, '#ffffff', 0.1),
      sheetGlass: rgba(mix(colors.bg, '#ffffff', 0.1), 0.84),
      card: 'rgba(255,255,255,0.1)',
      text: '#ffffff',
      subtext: '#a09d96',
      separator: 'rgba(255,255,255,0.14)',
      accent: '#ffb340',
      dark
    };
  }
  return {
    glass: rgba(mix(colors.bg, '#ffffff', 0.55), 0.5),
    glassBorder: 'rgba(0,0,0,0.1)',
    sheet: mix(colors.bg, '#ffffff', 0.5),
    sheetGlass: rgba(mix(colors.bg, '#ffffff', 0.5), 0.86),
    card: 'rgba(0,0,0,0.06)',
    text: '#000000',
    subtext: '#6c6c70',
    separator: 'rgba(0,0,0,0.14)',
    accent: '#ff9500',
    dark
  };
}
