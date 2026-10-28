import { createContext, useContext } from 'react';

/**
 * Every text the reader shows. Pass a partial object as the `labels` prop of EpubReaderView to translate
 * (for example into Pashto, Dari or Arabic); anything you leave out stays English.
 */
export interface ReaderLabels {
  contents: string;
  chapters: string;
  font: string;
  lineSpacing: string;
  characterSpacing: string;
  wordSpacing: string;
  margins: string;
  columns: string;
  columnsAuto: string;
  columnsOne: string;
  columnsTwo: string;
  slide: string;
  curl: string;
  fastFade: string;
  scrollMode: string;
  light: string;
  dark: string;
  matchDevice: string;
  matchSurroundings: string;
  appearance: string;
  pageTurnStyle: string;
  delete: string;
  deleteBookmark: string;
  deleteHighlight: string;
  search: string;
  searchBook: string;
  searchInBook: string;
  searching: string;
  noResults: string;
  themesSettings: string;
  customizeTheme: string;
  customize: string;
  resetTheme: string;
  boldText: string;
  justifyText: string;
  pageTurnSound: string;
  accessibilityLayout: string;
  smallerText: string;
  largerText: string;
  readerMenu: string;
  closeBook: string;
  share: string;
  rotationLock: string;
  rotationLockNeedsPackage: string;
  lineGuide: string;
  turnOffLineGuide: string;
  backgroundDimming: string;
  dimHigh: string;
  dimMedium: string;
  dimLow: string;
  dimNone: string;
  bookmarkPage: string;
  highlight: string;
  note: string;
  addNote: string;
  addANote: string;
  underline: string;
  removeHighlight: string;
  dismiss: string;
  done: string;
  close: string;
  cancel: string;
  save: string;
  ok: string;
  noToc: string;
  noBookmarks: string;
  noHighlights: string;
  bookmarks: string;
  highlights: string;
  loading: string;
  couldNotOpen: string;
  tryAgain: string;
  openLink: string;
  open: string;
  lastPageInChapter: string;
  /** "N pages left in chapter" */
  pagesLeft: (n: number) => string;
  /** "3 of 120" */
  pageOfTotal: (page: number, total: number) => string;
  /** "Page 3 of 120" */
  pageOfTotalLong: (page: number, total: number) => string;
  returnToPage: (page: number) => string;
  /** how numbers are written (e.g. Arabic-Indic digits for an Arabic UI) */
  formatNumber: (n: number) => string;
}

export const DEFAULT_LABELS: ReaderLabels = {
  contents: 'Contents',
  chapters: 'Chapters',
  font: 'Font',
  lineSpacing: 'LINE SPACING',
  characterSpacing: 'CHARACTER SPACING',
  wordSpacing: 'WORD SPACING',
  margins: 'MARGINS',
  columns: 'Columns',
  columnsAuto: 'Auto Set',
  columnsOne: 'One',
  columnsTwo: 'Two',
  slide: 'Slide',
  curl: 'Curl',
  fastFade: 'Fast Fade',
  scrollMode: 'Scroll',
  light: 'Light',
  dark: 'Dark',
  matchDevice: 'Match Device',
  matchSurroundings: 'Match Surroundings',
  appearance: 'Appearance',
  pageTurnStyle: 'Page turn style',
  delete: 'Delete',
  deleteBookmark: 'Delete bookmark?',
  deleteHighlight: 'Delete highlight?',
  search: 'Search',
  searchBook: 'Search Book',
  searchInBook: 'Search in book',
  searching: 'Searching…',
  noResults: 'No results',
  themesSettings: 'Themes & Settings',
  customizeTheme: 'Customize Theme',
  customize: 'Customize',
  resetTheme: 'Reset Theme',
  boldText: 'Bold Text',
  justifyText: 'Justify Text',
  pageTurnSound: 'Page Turn Sound',
  accessibilityLayout: 'Accessibility & Layout Options',
  smallerText: 'Smaller text',
  largerText: 'Larger text',
  readerMenu: 'Reader menu',
  closeBook: 'Close book',
  share: 'Share',
  rotationLock: 'Rotation lock',
  rotationLockNeedsPackage: 'Install expo-screen-orientation to enable the rotation lock.',
  lineGuide: 'Line guide',
  turnOffLineGuide: 'Turn Off Line Guide',
  backgroundDimming: 'Background Dimming',
  dimHigh: 'High',
  dimMedium: 'Medium',
  dimLow: 'Low',
  dimNone: 'None',
  bookmarkPage: 'Bookmark this page',
  highlight: 'Highlight',
  note: 'Note',
  addNote: 'Add note',
  addANote: 'Add a note',
  underline: 'Underline',
  removeHighlight: 'Remove highlight',
  dismiss: 'Dismiss',
  done: 'Done',
  close: 'Close',
  cancel: 'Cancel',
  save: 'Save',
  ok: 'OK',
  noToc: 'No table of contents',
  noBookmarks: 'No bookmarks yet. Tap the bookmark button while reading.',
  noHighlights: 'No highlights or notes yet. Select text to add one.',
  bookmarks: 'Bookmarks',
  highlights: 'Highlights',
  loading: 'Opening book…',
  couldNotOpen: 'This book could not be opened',
  tryAgain: 'Try again',
  openLink: 'Open this link?',
  open: 'Open',
  lastPageInChapter: 'Last page in chapter',
  pagesLeft: (n) => `${n} page${n === 1 ? '' : 's'} left in chapter`,
  pageOfTotal: (p, t) => `${p} of ${t}`,
  pageOfTotalLong: (p, t) => `Page ${p} of ${t}`,
  returnToPage: (p) => `Return to page ${p}`,
  formatNumber: (n) => String(n)
};

const LabelsContext = createContext<ReaderLabels>(DEFAULT_LABELS);

export const LabelsProvider = LabelsContext.Provider;
export function useLabels(): ReaderLabels {
  return useContext(LabelsContext);
}

export function mergeLabels(partial?: Partial<ReaderLabels>): ReaderLabels {
  return partial ? { ...DEFAULT_LABELS, ...partial } : DEFAULT_LABELS;
}

