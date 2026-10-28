import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { READER_HTML } from './engine/html';
import { themeColors, toEngineSettings } from './themes';
import type {
  BookLocation,
  BookMetadata,
  EpubSource,
  Highlight,
  ReaderSettings,
  RelocateEvent,
  SafeInsets,
  SearchResult,
  SelectionEvent,
  TocItem
} from './types';

export interface ReaderErrorInfo {
  /** true when the book cannot be shown (failed to open, reader engine stopped); false for a problem on one page */
  fatal: boolean;
}

export interface EpubReaderProps {
  source: EpubSource;
  settings: ReaderSettings;
  /** system colour scheme, used when settings.appearance is 'device' */
  systemDark?: boolean;
  /** Space reserved for status bar / home indicator (and the notch in landscape). The engine adds room for the running header and footer. */
  safeInsets?: SafeInsets;
  initialLocation?: BookLocation | { progress: number };
  highlights?: Highlight[];
  /**
   * Largest EPUB (bytes) that will be loaded. The whole book is held in memory while it is opened, so very large
   * files can crash low-memory phones. Default 150 MB, 0 disables the check.
   */
  maxFileSize?: number;
  /** Items added to the native text-selection menu. `onMenuAction` fires with the item key. */
  menuItems?: { label: string; key: string }[];
  onMenuAction?: (key: string, selection: SelectionEvent | null) => void;
  onReady?: (info: { metadata: BookMetadata; rtl: boolean }) => void;
  onToc?: (items: TocItem[]) => void;
  onCover?: (dataUri: string) => void;
  onRelocate?: (e: RelocateEvent) => void;
  /** fired once the whole book has been indexed: cumulative character offset of every spine item */
  onIndexed?: (info: { totalLength: number; cum: number[] }) => void;
  onSelection?: (e: SelectionEvent | null) => void;
  onHighlightTap?: (id: string, rect: SelectionEvent['rect']) => void;
  onTap?: () => void;
  /** a page turn animation is starting (use it to play a sound) */
  onPageTurn?: () => void;
  /** a web or mail link was tapped (other schemes are never forwarded). Open it yourself, ideally after asking. */
  onLink?: (href: string) => void;
  /** an internal link (footnote, cross reference) is about to jump; `from` is where the reader was, so you can offer a way back */
  onLinkJump?: (from: BookLocation) => void;
  /** the reading direction changed (the user overrode it in the settings) */
  onDirectionChange?: (rtl: boolean) => void;
  onSearchResults?: (searchId: number, results: SearchResult[], done: boolean) => void;
  onEndReached?: (edge: 'start' | 'end') => void;
  onError?: (message: string, info: ReaderErrorInfo) => void;
}

export interface EpubReaderHandle {
  next(): void;
  prev(): void;
  goTo(location: { spine: number; offset?: number; fragment?: string } | { progress: number }): void;
  search(query: string, searchId: number): void;
  cancelSearch(searchId?: number): void;
  /** Jump to a search result and flash the match. */
  showSearchResult(r: SearchResult): void;
  clearSelection(): void;
  /** Replace the running header / footer text drawn on the page. */
  setLabels(header: string, footer: string): void;
}

const DEFAULT_MAX_FILE = 150 * 1024 * 1024;
const ENGINE_START_TIMEOUT = 20000;
const CHUNK = 256 * 1024;

/** Identity of a source: the explicit `key`, the uri, or a fingerprint sampled across the base64 data. */
export function sourceKeyOf(source: EpubSource): string {
  if (source.key) return source.key;
  if ('uri' in source) return source.uri;
  const b = source.base64;
  let h = 5381;
  const step = Math.max(1, Math.floor(b.length / 512));
  for (let i = 0; i < b.length; i += step) h = ((h << 5) + h + b.charCodeAt(i)) | 0;
  return `b64:${b.length}:${h >>> 0}`;
}

async function uriToBase64(source: { uri: string; headers?: Record<string, string> }, maxBytes: number): Promise<string> {
  let res: Response;
  try {
    res = await fetch(source.uri, source.headers ? { headers: source.headers } : undefined);
  } catch {
    throw new Error('The book file could not be opened (it may have been moved or deleted, or there is no connection).');
  }
  // file:// responses report status 0 on some platforms, so only real HTTP errors count
  if (res.status >= 400) throw new Error(`The book could not be downloaded (error ${res.status}).`);
  const blob = await res.blob();
  if (maxBytes > 0 && blob.size > maxBytes) {
    throw new Error(`This book is too large to open (${Math.round(blob.size / 1048576)} MB).`);
  }
  if (blob.size === 0) throw new Error('The book file is empty.');
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('The book file could not be read.'));
    fr.onloadend = () => {
      const s = String(fr.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    fr.readAsDataURL(blob);
  });
}

function cleanBase64(data: string): string {
  let s = data;
  if (s.startsWith('data:')) s = s.slice(s.indexOf(',') + 1);
  if (/\s/.test(s.slice(0, 4096)) || s.indexOf('\n') >= 0) s = s.replace(/\s+/g, '');
  return s;
}

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

// U+2028/2029 are legal in JSON but terminate a JS string literal, so escape them.
function toScript(cmd: object): string {
  const json = JSON.stringify(JSON.stringify(cmd)).split(LS).join('\\u2028').split(PS).join('\\u2029');
  return `window.__cmd(${json});true;`;
}

export const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(function EpubReader(props, ref) {
  const { source, settings, systemDark = false, safeInsets = { top: 0, bottom: 0 }, highlights, menuItems } = props;
  const web = useRef<WebView>(null);
  const cb = useRef(props);
  cb.current = props;
  const [engineReady, setEngineReady] = useState(false);
  // bumping this remounts the WebView (after the system killed its process)
  const [webKey, setWebKey] = useState(0);
  const opened = useRef(false);
  const selection = useRef<SelectionEvent | null>(null);
  const metaRef = useRef<BookMetadata>({ title: '', author: '', language: '', publisher: '' });
  const lastLoc = useRef<BookLocation | null>(null);
  const lastKey = useRef('');

  const engineSettings = useMemo(
    () => toEngineSettings(settings, systemDark, safeInsets),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, systemDark, safeInsets.top, safeInsets.bottom, safeInsets.left, safeInsets.right]
  );
  // only what the engine actually uses decides about re-layout (the brightness slider, the page sound ... must not)
  const engineJson = JSON.stringify(engineSettings);
  const latest = useRef({ engineSettings, highlights });
  latest.current = { engineSettings, highlights };

  const send = useCallback((cmd: object) => {
    web.current?.injectJavaScript(toScript(cmd));
  }, []);

  // the engine never started (blocked WebView, out of memory ...)
  useEffect(() => {
    if (engineReady) return;
    const t = setTimeout(() => cb.current.onError?.('The reader could not be started.', { fatal: true }), ENGINE_START_TIMEOUT);
    return () => clearTimeout(t);
  }, [engineReady, webKey]);

  // open (or re-open) the book once the engine is up
  const sourceKey = sourceKeyOf(source);
  useEffect(() => {
    if (!engineReady) return;
    let cancelled = false;
    opened.current = false;
    if (lastKey.current !== sourceKey) {
      lastKey.current = sourceKey;
      lastLoc.current = null;
    }
    (async () => {
      try {
        const limit = cb.current.maxFileSize ?? DEFAULT_MAX_FILE;
        let data = 'uri' in source ? await uriToBase64(source, limit) : cleanBase64(source.base64);
        if (cancelled) return;
        if (!data) throw new Error('The book file is empty.');
        // the book travels in pieces: one huge string would exist several times over (JSON, bridge, page)
        for (let i = 0; i < data.length; i += CHUNK) {
          web.current?.injectJavaScript(`window.__chunk(${i === 0 ? 1 : 0},"${data.slice(i, i + CHUNK)}");true;`);
        }
        data = '';
        // settings, highlights and position are read now, not when loading started
        send({
          cmd: 'open',
          settings: latest.current.engineSettings,
          highlights: latest.current.highlights || [],
          location: lastLoc.current || cb.current.initialLocation
        });
        opened.current = true;
      } catch (e) {
        cb.current.onError?.(String((e as Error)?.message || e), { fatal: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady, sourceKey]);

  useEffect(() => {
    if (opened.current) send({ cmd: 'settings', settings: latest.current.engineSettings });
  }, [engineJson, send]);

  useEffect(() => {
    if (opened.current) send({ cmd: 'highlights', list: highlights || [] });
  }, [highlights, send]);

  // Android killed the renderer / iOS terminated the web content process: start over at the last position
  const recover = useCallback(() => {
    opened.current = false;
    setEngineReady(false);
    setWebKey((k) => k + 1);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      next: () => send({ cmd: 'next' }),
      prev: () => send({ cmd: 'prev' }),
      goTo: (location) => send({ cmd: 'goto', location }),
      search: (query, searchId) => send({ cmd: 'search', query, id: searchId }),
      cancelSearch: (searchId) => send({ cmd: 'cancelSearch', id: searchId }),
      showSearchResult: (r) => {
        send({ cmd: 'goto', location: { spine: r.spine, offset: r.offset } });
        send({ cmd: 'showHit', offset: r.offset, length: r.length });
      },
      clearSelection: () => {
        selection.current = null;
        send({ cmd: 'clearSelection' });
      },
      setLabels: (header, footer) => send({ cmd: 'labels', header, footer })
    }),
    [send]
  );

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: { type: string; data: any };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    const p = cb.current;
    const d = msg.data && typeof msg.data === 'object' ? msg.data : {};
    switch (msg.type) {
      case 'ready':
        setEngineReady(true);
        break;
      case 'metadata':
        metaRef.current = d;
        break;
      case 'toc':
        p.onReady?.({ metadata: metaRef.current, rtl: !!d.rtl });
        p.onToc?.(Array.isArray(d.items) ? d.items : []);
        break;
      case 'cover':
        if (typeof d.uri === 'string') p.onCover?.(d.uri);
        break;
      case 'relocate':
        lastLoc.current = { spine: d.spine, offset: d.offset };
        p.onRelocate?.(d);
        break;
      case 'indexed':
        p.onIndexed?.(d);
        break;
      case 'selection':
        selection.current = d;
        p.onSelection?.(d);
        break;
      case 'selectionClear':
        selection.current = null;
        p.onSelection?.(null);
        break;
      case 'highlightTap':
        p.onHighlightTap?.(d.id, d.rect);
        break;
      case 'tap':
        p.onTap?.();
        break;
      case 'pageTurn':
        p.onPageTurn?.();
        break;
      case 'link':
        if (typeof d.href === 'string' && /^(https?|mailto):/i.test(d.href)) p.onLink?.(d.href);
        break;
      case 'linkJump':
        p.onLinkJump?.({ spine: d.spine, offset: d.offset });
        break;
      case 'direction':
        p.onDirectionChange?.(!!d.rtl);
        break;
      case 'searchResults':
        p.onSearchResults?.(d.id, Array.isArray(d.results) ? d.results : [], !!d.done);
        break;
      case 'end':
        p.onEndReached?.(d.edge);
        break;
      case 'error':
        p.onError?.(String(d.message || 'Unknown error'), { fatal: !!d.fatal });
        break;
    }
  }, []);

  const bg = themeColors(settings, systemDark).bg;

  return (
    <View style={[styles.fill, { backgroundColor: bg }]}>
      <WebView
        key={webKey}
        ref={web}
        style={[styles.fill, { backgroundColor: bg }]}
        originWhitelist={['*']}
        source={{ html: READER_HTML }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        allowsInlineMediaPlayback
        hideKeyboardAccessoryView
        setSupportMultipleWindows={false}
        // the page is generated here and never needs the file system, the network or the system font scale
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        cacheEnabled={false}
        textZoom={100}
        menuItems={menuItems}
        onCustomMenuSelection={(e) => {
          const key = (e.nativeEvent as { key: string }).key;
          cb.current.onMenuAction?.(key, selection.current);
        }}
        onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || req.url.startsWith('data:') || req.url.startsWith('about:')}
        onRenderProcessGone={recover}
        onContentProcessDidTerminate={recover}
        onError={(e) => cb.current.onError?.(e.nativeEvent.description || 'The reader failed to load.', { fatal: true })}
      />
    </View>
  );
});

const styles = StyleSheet.create({ fill: { flex: 1 } });
