import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Linking, Platform, Pressable, Share, StatusBar, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { EpubReader } from './EpubReader';
import type { EpubReaderHandle } from './EpubReader';
import { chromeColors, DEFAULT_SETTINGS, isDark, themeColors } from './themes';
import type {
  Bookmark,
  BookLocation,
  BookMetadata,
  EpubSource,
  Highlight,
  HighlightColor,
  PageTurn,
  ReaderSettings,
  RelocateEvent,
  SearchResult,
  SelectionEvent,
  TocItem
} from './types';
import { AppearanceSheet } from './ui/AppearanceSheet';
import { ContentsSheet } from './ui/ContentsSheet';
import { CustomizeSheet } from './ui/CustomizeSheet';
import { playPageTurn } from './sound';
import { Glass } from './ui/Glass';
import { HighlightMenu } from './ui/HighlightMenu';
import { Icon } from './ui/Icons';
import { LineGuide } from './ui/LineGuide';
import type { DimLevel } from './ui/LineGuide';
import { NoteEditor } from './ui/NoteEditor';
import { SearchSheet } from './ui/SearchSheet';

export interface EpubReaderViewProps {
  source: EpubSource;
  /** shown in the Contents sheet until the book's own title is read */
  title?: string;
  safeInsets?: { top: number; bottom: number };
  initialLocation?: BookLocation;
  initialSettings?: Partial<ReaderSettings>;
  initialHighlights?: Highlight[];
  initialBookmarks?: Bookmark[];
  onClose?: () => void;
  onLocationChange?: (e: RelocateEvent) => void;
  onHighlightsChange?: (list: Highlight[]) => void;
  onBookmarksChange?: (list: Bookmark[]) => void;
  onSettingsChange?: (s: ReaderSettings) => void;
  onMetadata?: (m: BookMetadata) => void;
  onCover?: (dataUri: string) => void;
  onError?: (message: string) => void;
}

const RESET_THEME: Partial<ReaderSettings> = {
  fontId: 'original',
  bold: false,
  customize: false,
  lineHeight: 1.5,
  letterSpacing: 0,
  wordSpacing: 0,
  margins: 0,
  columns: 'auto',
  justify: false
};

// expo-screen-orientation is optional (needed for the rotation lock button)
let ScreenOrientation: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ScreenOrientation = require('expo-screen-orientation');
} catch {
  ScreenOrientation = null;
}

const DIM_LABELS: { id: DimLevel; label: string }[] = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
  { id: 'none', label: 'None' }
];

const SAMPLE = 'The reader turned the page slowly, listening to the wind move across the empty hills.';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function defaultInsets() {
  return Platform.OS === 'ios' ? { top: 50, bottom: 30 } : { top: StatusBar.currentHeight || 24, bottom: 0 };
}

type SheetName = null | 'contents' | 'search' | 'appearance' | 'customize';

export function EpubReaderView(props: EpubReaderViewProps) {
  const safe = props.safeInsets || defaultInsets();
  const screen = useWindowDimensions();
  const systemDark = useColorScheme() === 'dark';
  const reader = useRef<EpubReaderHandle>(null);

  const [settings, setSettings] = useState<ReaderSettings>({ ...DEFAULT_SETTINGS, ...props.initialSettings });
  const [highlights, setHighlights] = useState<Highlight[]>(props.initialHighlights || []);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(props.initialBookmarks || []);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [meta, setMeta] = useState<BookMetadata | null>(null);
  const [rtl, setRtl] = useState(false);
  const [loc, setLoc] = useState<RelocateEvent | null>(null);
  const [index, setIndex] = useState<{ totalLength: number; cum: number[] } | null>(null);
  const [cpp, setCpp] = useState(1200); // characters per page, measured from the chapters seen so far
  // reading starts with nothing but the running header/footer; a tap shows the close button and the menu button
  const [chrome, setChrome] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pillW, setPillW] = useState(0);
  const [lineGuide, setLineGuide] = useState(false);
  const [dimLevel, setDimLevel] = useState<DimLevel>('high');
  const [lineMenu, setLineMenu] = useState(false);
  const [rotLocked, setRotLocked] = useState(false);
  const [returnTo, setReturnTo] = useState<{ spine: number; offset: number; page: number } | null>(null);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [active, setActive] = useState<{ id: string; rect: SelectionEvent['rect'] } | null>(null);
  const [selection, setSelection] = useState<SelectionEvent | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchId = useRef(0);
  const seen = useRef<Record<number, { len: number; pc: number }>>({});
  const layoutKey = useRef('');

  const dark = isDark(settings, systemDark);
  const page = themeColors(settings, systemDark);
  const colors = useMemo(() => chromeColors(page, dark), [page, dark]);

  // ----- chrome visibility animation
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: chrome ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [chrome, fade]);
  const fadeOut = fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const menuFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(menuFade, { toValue: menuOpen ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [menuOpen, menuFade]);
  useEffect(() => {
    if (!chrome) setMenuOpen(false);
  }, [chrome]);

  // ----- persistence helpers
  const updateHighlights = useCallback(
    (fn: (prev: Highlight[]) => Highlight[]) => {
      setHighlights((prev) => {
        const next = fn(prev);
        props.onHighlightsChange?.(next);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.onHighlightsChange]
  );
  const updateBookmarks = useCallback(
    (fn: (prev: Bookmark[]) => Bookmark[]) => {
      setBookmarks((prev) => {
        const next = fn(prev);
        props.onBookmarksChange?.(next);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.onBookmarksChange]
  );
  const changeSettings = (patch: Partial<ReaderSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    props.onSettingsChange?.(next);
  };

  // ----- book page numbers (estimated from characters per page)
  const onRelocate = (e: RelocateEvent) => {
    const key = [settings.fontSize, settings.fontId, settings.lineHeight, settings.letterSpacing, settings.wordSpacing, settings.margins, settings.customize, settings.columns, settings.bold, settings.pageTurn === 'scroll'].join('|');
    if (key !== layoutKey.current) {
      layoutKey.current = key;
      seen.current = {};
    }
    seen.current[e.spine] = { len: e.textLength, pc: e.pageCount };
    let len = 0;
    let pc = 0;
    Object.values(seen.current).forEach((v) => {
      len += v.len;
      pc += v.pc;
    });
    const next = pc > 0 && len > 0 ? len / pc : 1200;
    setCpp((old) => (Math.abs(old - next) / next > 0.01 ? next : old));
    setLoc(e);
    setActive(null);
    props.onLocationChange?.(e);
  };

  const pageOf = useCallback(
    (spine: number, offset: number) => {
      if (!index) return spine + 1;
      return Math.round(((index.cum[spine] || 0) + offset) / cpp) + 1;
    },
    [index, cpp]
  );
  const totalPages = index ? Math.max(1, Math.round(index.totalLength / cpp)) : loc ? loc.pageCount * loc.spineCount : 1;
  const curPage = loc ? Math.min(totalPages, pageOf(loc.spine, loc.offset)) : 1;
  const percent = Math.round((loc?.progress ?? 0) * 100);
  const pagesLeft = loc ? Math.max(0, loc.pageCount - loc.page - 1) : 0;

  // header / footer drawn on the page: chapter title + page number, or "N pages left" + "x of y" while the controls are shown
  useEffect(() => {
    if (!loc) return;
    const header = chrome ? (pagesLeft === 0 ? 'Last page in chapter' : `${pagesLeft} page${pagesLeft === 1 ? '' : 's'} left in chapter`) : loc.chapter;
    const footer = chrome ? `${curPage} of ${totalPages}` : `${curPage}`;
    reader.current?.setLabels(header, footer);
  }, [chrome, loc, curPage, totalPages, pagesLeft]);

  // ----- bookmarks
  const bookmarkHere = useMemo(
    () => (loc ? bookmarks.filter((b) => b.spine === loc.spine && b.offset >= loc.offset && b.offset < Math.max(loc.end, loc.offset + 1)) : []),
    [bookmarks, loc]
  );
  const toggleBookmark = () => {
    if (!loc) return;
    if (bookmarkHere.length) {
      const ids = new Set(bookmarkHere.map((b) => b.id));
      updateBookmarks((prev) => prev.filter((b) => !ids.has(b.id)));
    } else {
      updateBookmarks((prev) => [
        ...prev,
        { id: uid(), spine: loc.spine, offset: loc.offset, chapter: loc.chapter, excerpt: loc.excerpt, progress: loc.progress, createdAt: Date.now() }
      ]);
    }
  };

  // ----- highlights
  const createHighlight = (sel: SelectionEvent, withNote: boolean) => {
    setSelection(null);
    const h: Highlight = {
      id: uid(),
      spine: sel.spine,
      start: sel.start,
      end: sel.end,
      text: sel.text.replace(/\s+/g, ' ').trim(),
      color: 'yellow',
      chapter: loc?.chapter,
      createdAt: Date.now()
    };
    updateHighlights((prev) => [...prev, h]);
    reader.current?.clearSelection();
    if (withNote) setNoteFor(h.id);
    else setActive({ id: h.id, rect: sel.rect });
  };
  const patchHighlight = (id: string, patch: Partial<Highlight>) =>
    updateHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const removeHighlight = (id: string) => {
    updateHighlights((prev) => prev.filter((h) => h.id !== id));
    setActive(null);
  };
  const activeHighlight = active ? highlights.find((h) => h.id === active.id) : undefined;
  const noteHighlight = noteFor ? highlights.find((h) => h.id === noteFor) : undefined;

  // ----- search
  const runSearch = (q: string) => {
    const id = ++searchId.current;
    setResults([]);
    if (q.trim().length < 2) {
      setSearching(false);
      reader.current?.cancelSearch(id);
      return;
    }
    setSearching(true);
    reader.current?.search(q, id);
  };

  const closeSheet = () => setSheet(null);
  // remember where we were so the "back" pill can return after a jump (contents, search, bookmark ...)
  const jump = (to: Parameters<EpubReaderHandle['goTo']>[0]) => {
    if (loc) setReturnTo({ spine: loc.spine, offset: loc.offset, page: curPage });
    setChrome(false);
    reader.current?.goTo(to);
  };
  // two modals cannot be presented at once on iOS, so switch sheets after the first one is gone
  const switchSheet = (to: SheetName) => {
    setSheet(null);
    setTimeout(() => setSheet(to), 380);
  };
  const toggleRotationLock = async () => {
    if (!ScreenOrientation) {
      Alert.alert('Rotation lock', 'Install expo-screen-orientation to enable the rotation lock.');
      return;
    }
    try {
      if (rotLocked) {
        await ScreenOrientation.unlockAsync();
        setRotLocked(false);
      } else {
        const o = await ScreenOrientation.getOrientationAsync();
        const O = ScreenOrientation.Orientation;
        const L = ScreenOrientation.OrientationLock;
        await ScreenOrientation.lockAsync(o === O.LANDSCAPE_LEFT ? L.LANDSCAPE_LEFT : o === O.LANDSCAPE_RIGHT ? L.LANDSCAPE_RIGHT : L.PORTRAIT_UP);
        setRotLocked(true);
      }
    } catch {
      // not supported on this device
    }
  };
  useEffect(
    () => () => {
      if (ScreenOrientation) ScreenOrientation.unlockAsync().catch(() => undefined);
    },
    []
  );
  const onLineGuideButton = () => {
    setMenuOpen(false);
    if (!lineGuide) {
      setLineGuide(true);
      setChrome(false);
    } else setLineMenu(true);
  };
  const share = () => {
    const text = [loc?.excerpt, meta?.title && `— ${meta.title}`].filter(Boolean).join(' ');
    Share.share({ message: text || meta?.title || '' }).catch(() => undefined);
  };

  const progressFill = Math.max(0, Math.min(1, loc?.progress ?? 0));
  const tx = colors.text;

  return (
    <View style={[styles.root, { backgroundColor: page.bg }]}>
      <EpubReader
        ref={reader}
        source={props.source}
        settings={settings}
        systemDark={systemDark}
        safeInsets={safe}
        initialLocation={props.initialLocation}
        highlights={highlights}
        onReady={({ metadata, rtl: isRtl }) => {
          setMeta(metadata);
          setRtl(isRtl);
          props.onMetadata?.(metadata);
        }}
        onToc={setToc}
        onCover={props.onCover}
        onIndexed={setIndex}
        onRelocate={onRelocate}
        onPageTurn={() => {
          if (settings.pageSound) playPageTurn();
        }}
        onTap={() => {
          if (active) setActive(null);
          else if (menuOpen) setMenuOpen(false);
          else setChrome((c) => !c);
        }}
        onHighlightTap={(id, rect) => setActive({ id, rect })}
        onSelection={(sel) => {
          setSelection(sel);
          if (sel) {
            setChrome(false);
            setActive(null);
          }
        }}
        onLink={(href) => Linking.openURL(href).catch(() => undefined)}
        onSearchResults={(id, found, done) => {
          if (id !== searchId.current) return;
          setResults((prev) => prev.concat(found));
          if (done) setSearching(false);
        }}
        onError={(m) => {
          setError(m);
          props.onError?.(m);
        }}
      />

      {/* page brightness */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: (1 - settings.brightness) * 0.75 }]} />

      {/* line guide */}
      {lineGuide && (
        <LineGuide
          bg={page.bg}
          dark={dark}
          dim={dimLevel}
          lineHeight={settings.fontSize * (settings.customize ? settings.lineHeight : 1.5)}
          minY={safe.top + 30}
          maxY={screen.height - safe.bottom - 30}
        />
      )}

      {/* bookmark ribbon while the controls are hidden */}
      {bookmarkHere.length > 0 && (
        <Animated.View pointerEvents="none" style={[styles.ribbon, { right: 22, opacity: fadeOut }]}>
          <View style={styles.ribbonBody} />
          <View style={styles.ribbonNotch} />
        </Animated.View>
      )}

      {/* close */}
      <Animated.View pointerEvents={chrome ? 'auto' : 'none'} style={[styles.closeWrap, { top: safe.top + 2, opacity: fade }]}>
        <Pressable onPress={props.onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close book">
          <Glass dark={dark} background={colors.glass} border={colors.glassBorder} style={styles.circle}>
            <Icon name="close" color={tx} size={22} />
          </Glass>
        </Pressable>
      </Animated.View>

      {/* back to where we came from, like the "193" pill in Books */}
      {returnTo && (
        <Animated.View pointerEvents={chrome ? 'auto' : 'none'} style={[styles.returnWrap, { top: safe.top + 2, opacity: fade }]}>
          <Pressable
            onPress={() => {
              reader.current?.goTo({ spine: returnTo.spine, offset: returnTo.offset });
              setReturnTo(null);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Return to page ${returnTo.page}`}
          >
            <Glass dark={dark} background={colors.glass} border={colors.glassBorder} style={styles.returnPill}>
              <Icon name="undo" color={tx} size={22} />
              <Text style={{ color: tx, fontSize: 20, marginStart: 8 }}>{returnTo.page}</Text>
            </Glass>
          </Pressable>
        </Animated.View>
      )}

      {/* menu button (collapsed) */}
      <Animated.View
        pointerEvents={chrome && !menuOpen ? 'auto' : 'none'}
        style={[styles.menuBtnWrap, { bottom: safe.bottom + 14, opacity: Animated.multiply(fade, Animated.subtract(1, menuFade)) }]}
      >
        <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Reader menu">
          <Glass dark={dark} background={colors.glass} border={colors.glassBorder} style={styles.menuBtn}>
            <Icon name="list" color={tx} size={24} />
          </Glass>
        </Pressable>
      </Animated.View>

      {/* floating controls (expanded menu) */}
      <Animated.View pointerEvents={chrome && menuOpen ? 'box-none' : 'none'} style={[styles.controls, { bottom: safe.bottom + 44, opacity: menuFade }]}>
        <Pressable
          onPress={() => {
            setMenuOpen(false);
            setSheet('contents');
          }}
          accessibilityRole="button"
          accessibilityLabel="Contents"
          style={styles.pillWrap}
        >
          <Glass dark={dark} background={colors.glass} border={colors.glassBorder} style={styles.pill}>
            <View style={styles.pillRow} onLayout={(e) => setPillW(e.nativeEvent.layout.width)}>
              <Text style={[styles.pillText, { color: tx }]}>Contents  •  {percent}%</Text>
              <Icon name="list" color={tx} size={24} />
            </View>
            {/* progress fill with inverted text on top of it */}
            <View
              pointerEvents="none"
              style={[styles.fill, { width: progressFill * pillW, backgroundColor: dark ? 'rgba(255,255,255,0.35)' : '#1c1408', [rtl ? 'right' : 'left']: 0 }]}
            >
              <View style={[styles.pillRow, { position: 'absolute', top: 0, width: pillW, [rtl ? 'right' : 'left']: 0 }]}>
                <Text style={[styles.pillText, { color: dark ? tx : '#ffffff' }]}>Contents  •  {percent}%</Text>
                <Icon name="list" color={dark ? tx : '#ffffff'} size={24} />
              </View>
            </View>
          </Glass>
        </Pressable>

        <Pressable
          onPress={() => {
            setMenuOpen(false);
            setSheet('search');
          }}
          accessibilityRole="button"
          accessibilityLabel="Search book"
          style={styles.pillWrap}
        >
          <Glass dark={dark} background={colors.glass} border={colors.glassBorder} style={styles.pill}>
            <View style={styles.pillRow}>
              <Text style={[styles.pillText, { color: tx }]}>Search Book</Text>
              <Icon name="search" color={tx} size={24} />
            </View>
          </Glass>
        </Pressable>

        <Pressable
          onPress={() => {
            setMenuOpen(false);
            setSheet('appearance');
          }}
          accessibilityRole="button"
          accessibilityLabel="Themes and settings"
          style={styles.pillWrap}
        >
          <Glass dark={dark} background={colors.glass} border={colors.glassBorder} style={styles.pill}>
            <View style={styles.pillRow}>
              <Text style={[styles.pillText, { color: tx }]}>Themes & Settings</Text>
              <Icon name="textSize" color={tx} size={26} />
            </View>
          </Glass>
        </Pressable>

        <View style={styles.roundRow}>
          <Pressable onPress={share} style={styles.roundWrap} accessibilityRole="button" accessibilityLabel="Share">
            <Glass dark={dark} background={colors.glass} border={colors.glassBorder} style={styles.round}>
              <Icon name="share" color={tx} size={24} />
            </Glass>
          </Pressable>
          <Pressable onPress={toggleRotationLock} style={styles.roundWrap} accessibilityRole="button" accessibilityLabel="Rotation lock" accessibilityState={{ selected: rotLocked }}>
            <Glass dark={dark} background={rotLocked ? (dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.18)') : colors.glass} border={colors.glassBorder} style={styles.round}>
              <Icon name="rotationLock" color={tx} size={26} active={rotLocked} />
            </Glass>
          </Pressable>
          <Pressable onPress={onLineGuideButton} style={styles.roundWrap} accessibilityRole="button" accessibilityLabel="Line guide" accessibilityState={{ selected: lineGuide }}>
            <Glass dark={dark} background={lineGuide ? (dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.18)') : colors.glass} border={colors.glassBorder} style={styles.round}>
              <Icon name="lineGuide" color={tx} size={26} active={lineGuide} />
            </Glass>
          </Pressable>
          <Pressable onPress={toggleBookmark} style={styles.roundWrap} accessibilityRole="button" accessibilityLabel="Bookmark this page" accessibilityState={{ selected: bookmarkHere.length > 0 }}>
            <Glass dark={dark} background={colors.glass} border={colors.glassBorder} style={styles.round}>
              <Icon name="bookmark" color={tx} size={24} active={bookmarkHere.length > 0} />
            </Glass>
          </Pressable>
        </View>
      </Animated.View>

{selection && !active && !noteFor && (() => {
        const w = 214;
        const r = selection.rect;
        const left = Math.max(8, Math.min(screen.width - w - 8, r.x + r.width / 2 - w / 2));
        // the system callout (Copy / Look Up) sits above the selection, so ours goes below it
        const below = r.y + r.height + 16;
        const top = below + 54 > screen.height - safe.bottom ? Math.max(safe.top + 8, r.y - 120) : below;
        return (
          <Glass dark={dark} background={colors.sheetGlass} border={colors.glassBorder} intensity={55} style={[styles.selBar, { left, top, width: w }]}>
            <Pressable
              style={styles.selBtn}
              onPress={() => createHighlight(selection, false)}
              accessibilityRole="button"
              accessibilityLabel="Highlight"
            >
              <Icon name="highlighter" color={tx} size={22} />
              <Text style={[styles.selText, { color: tx }]}>Highlight</Text>
            </Pressable>
            <View style={[styles.selSep, { backgroundColor: colors.separator }]} />
            <Pressable
              style={styles.selBtn}
              onPress={() => createHighlight(selection, true)}
              accessibilityRole="button"
              accessibilityLabel="Add note"
            >
              <Icon name="pencil" color={tx} size={22} />
              <Text style={[styles.selText, { color: tx }]}>Note</Text>
            </Pressable>
          </Glass>
        );
      })()}

      {activeHighlight && active && (
        <HighlightMenu
          highlight={activeHighlight}
          rect={active.rect}
          screen={screen}
          colors={colors}
          onColor={(c: HighlightColor) => patchHighlight(activeHighlight.id, { color: c })}
          onToggleUnderline={() => patchHighlight(activeHighlight.id, { style: activeHighlight.style === 'underline' ? 'highlight' : 'underline' })}
          onNote={() => {
            setNoteFor(activeHighlight.id);
            setActive(null);
          }}
          onDelete={() => removeHighlight(activeHighlight.id)}
          onDismiss={() => setActive(null)}
        />
      )}

      {error && (
        <View style={[styles.error, { backgroundColor: colors.sheet }]}>
          <Text style={{ color: colors.text, fontSize: 15, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={() => setError(null)} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.accent, fontSize: 16 }}>OK</Text>
          </Pressable>
        </View>
      )}

      {lineMenu && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLineMenu(false)} accessibilityLabel="Dismiss" />
          <View style={[styles.lineMenu, { bottom: safe.bottom + 20, backgroundColor: colors.dark ? '#4a4742' : '#ffffff', borderColor: colors.glassBorder }]}>
            <Text style={[styles.lineMenuHead, { color: colors.subtext }]}>Background Dimming</Text>
            {DIM_LABELS.map((d) => (
              <Pressable
                key={d.id}
                style={styles.lineItem}
                onPress={() => {
                  setDimLevel(d.id);
                  setLineMenu(false);
                }}
              >
                <View style={styles.lineCheck}>{dimLevel === d.id && <Icon name="check" color={tx} size={20} />}</View>
                <Text style={{ color: tx, fontSize: 19 }}>{d.label}</Text>
              </Pressable>
            ))}
            <View style={[styles.lineSep, { backgroundColor: colors.separator }]} />
            <Pressable
              style={styles.lineItem}
              onPress={() => {
                setLineGuide(false);
                setLineMenu(false);
              }}
            >
              <View style={styles.lineCheck} />
              <Text style={{ color: tx, fontSize: 19 }}>Turn Off Line Guide</Text>
            </Pressable>
          </View>
        </>
      )}

      <ContentsSheet
        visible={sheet === 'contents'}
        colors={colors}
        title={meta?.title || props.title || ''}
        subtitle={`Page ${curPage} of ${totalPages}`}
        toc={toc}
        currentSpine={loc?.spine ?? 0}
        pageOf={pageOf}
        bookmarks={bookmarks}
        highlights={highlights}
        onClose={closeSheet}
        onGoToc={(item) => {
          closeSheet();
          jump({ spine: item.spine, fragment: item.fragment });
        }}
        onGoBookmark={(b) => {
          closeSheet();
          jump({ spine: b.spine, offset: b.offset });
        }}
        onGoHighlight={(h) => {
          closeSheet();
          jump({ spine: h.spine, offset: h.start });
        }}
        onDeleteBookmark={(id) => updateBookmarks((prev) => prev.filter((b) => b.id !== id))}
        onDeleteHighlight={(id) => updateHighlights((prev) => prev.filter((h) => h.id !== id))}
      />
      <SearchSheet
        visible={sheet === 'search'}
        colors={colors}
        results={results}
        searching={searching}
        onClose={closeSheet}
        onSearch={runSearch}
        onPick={(r) => {
          closeSheet();
          if (loc) setReturnTo({ spine: loc.spine, offset: loc.offset, page: curPage });
          setChrome(false);
          reader.current?.showSearchResult(r);
        }}
      />
      <AppearanceSheet
        visible={sheet === 'appearance'}
        colors={colors}
        settings={settings}
        systemDark={systemDark}
        onChange={changeSettings}
        onCustomize={() => switchSheet('customize')}
        onClose={closeSheet}
      />
      <CustomizeSheet
        visible={sheet === 'customize'}
        colors={colors}
        page={page}
        settings={settings}
        sample={loc?.excerpt || SAMPLE}
        onChange={changeSettings}
        onReset={() => changeSettings(RESET_THEME)}
        onClose={() => switchSheet('appearance')}
      />
      <NoteEditor
        visible={!!noteHighlight}
        quote={noteHighlight?.text || ''}
        initial={noteHighlight?.note || ''}
        colors={colors}
        onCancel={() => setNoteFor(null)}
        onSave={(text) => {
          if (noteFor) patchHighlight(noteFor, { note: text || undefined });
          setNoteFor(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  closeWrap: { position: 'absolute', right: 16 },
  circle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  controls: { position: 'absolute', right: 16, width: '68%' },
  selBar: { position: 'absolute', height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center' },
  selBtn: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  selText: { fontSize: 15, fontWeight: '600' },
  selSep: { width: StyleSheet.hairlineWidth, height: 24 },
  lineMenu: {
    position: 'absolute', left: 16, width: 290, borderRadius: 28, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12
  },
  lineMenuHead: { fontSize: 15, fontWeight: '600', marginStart: 52, marginTop: 8, marginBottom: 4 },
  lineItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18 },
  lineCheck: { width: 34 },
  lineSep: { height: StyleSheet.hairlineWidth, marginVertical: 6, marginHorizontal: 18 },
  menuBtnWrap: { position: 'absolute', right: 16 },
  menuBtn: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  returnWrap: { position: 'absolute', left: 16 },
  returnPill: { height: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  pillRow: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  pillWrap: { marginBottom: 8 },
  pill: { height: 50, borderRadius: 25 },
  pillText: { fontSize: 17, fontWeight: '500' },
  fill: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' },
  roundRow: { flexDirection: 'row', gap: 8 },
  roundWrap: { flex: 1 },
  round: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  ribbon: { position: 'absolute', top: 0, width: 16 },
  ribbonBody: { height: 26, backgroundColor: '#ff3b30' },
  ribbonNotch: {
    width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 7,
    borderLeftColor: '#ff3b30', borderRightColor: '#ff3b30', borderBottomColor: 'transparent'
  },
  error: { position: 'absolute', left: 24, right: 24, top: '40%', padding: 20, borderRadius: 14, alignItems: 'center', elevation: 10 }
});
