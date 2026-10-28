export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
export type HighlightStyle = 'highlight' | 'underline';

/** Position in the book. Offsets are text-character offsets inside the spine item, so they survive font/size changes. */
export interface BookLocation {
  spine: number;
  offset: number;
}

export interface Highlight {
  id: string;
  spine: number;
  start: number;
  end: number;
  text: string;
  color: HighlightColor;
  style?: HighlightStyle;
  note?: string;
  chapter?: string;
  createdAt: number;
}

export interface Bookmark {
  id: string;
  spine: number;
  offset: number;
  chapter: string;
  excerpt: string;
  progress: number;
  createdAt: number;
}

export interface TocItem {
  label: string;
  spine: number;
  fragment: string;
  level: number;
}

export interface BookMetadata {
  title: string;
  author: string;
  language: string;
  publisher: string;
}

export interface RelocateEvent {
  spine: number;
  /** offset of the first character on the page */
  offset: number;
  /** offset just past the last character on the page */
  end: number;
  page: number;
  pageCount: number;
  spineCount: number;
  /** number of characters in this spine item */
  textLength: number;
  /** 0..1 across the whole book (exact once `indexed` is true) */
  progress: number;
  chapter: string;
  excerpt: string;
  indexed: boolean;
}

export interface SelectionEvent {
  spine: number;
  start: number;
  end: number;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
}

export interface SearchResult {
  spine: number;
  offset: number;
  length: number;
  chapter: string;
  before: string;
  match: string;
  after: string;
}

export interface ThemeColors {
  /** page background */
  bg: string;
  /** body text */
  fg: string;
  link: string;
}

/** A theme has a light and a dark variant, like the themes in Apple Books. */
export interface ReaderTheme {
  id: string;
  name: string;
  light: ThemeColors;
  dark: ThemeColors;
  bold?: boolean;
}

export type Appearance = 'light' | 'dark' | 'device';
export type PageTurn = 'slide' | 'curl' | 'fade' | 'scroll';
export type ColumnsSetting = 'auto' | 1 | 2;

export interface ReaderFont {
  id: string;
  name: string;
  /** CSS font-family, or 'original' to keep the book's own fonts */
  css: string;
}

export interface ReaderSettings {
  themeId: string;
  appearance: Appearance;
  fontId: string;
  fontSize: number;
  /** extra bold weight on top of the theme's own */
  bold: boolean;
  /** when false the spacing values below are ignored (defaults are used) */
  customize: boolean;
  lineHeight: number;
  /** percent, 0 = default */
  letterSpacing: number;
  /** percent, 0 = default */
  wordSpacing: number;
  /** percent change of the side margins, 0 = default */
  margins: number;
  columns: ColumnsSetting;
  justify: boolean;
  pageTurn: PageTurn;
  /** paper sound when a page is turned (Curl) */
  pageSound: boolean;
  /** 0.3 .. 1, dims the page like the Books brightness slider */
  brightness: number;
  /** 'auto' follows the book's page-progression-direction / language */
  direction: 'auto' | 'ltr' | 'rtl';
}

/**
 * Where the book comes from.
 *  - uri: file://, content:// (Android), https://, or an asset/bundle URI that fetch() can read. `headers` are sent with the request.
 *  - base64: the EPUB bytes as base64 (a data: prefix is accepted).
 * `key` identifies the book: when it changes the reader opens the new source. Defaults to the uri, or to a fingerprint of the data.
 */
export type EpubSource =
  | { uri: string; headers?: Record<string, string>; key?: string }
  | { base64: string; key?: string };

/** Safe-area space around the page, in points. Left/right matter in landscape on notched phones. */
export interface SafeInsets {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}
