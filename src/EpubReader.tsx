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
  SearchResult,
  SelectionEvent,
  TocItem
} from './types';

export interface EpubReaderProps {
  source: EpubSource;
  settings: ReaderSettings;
  /** system colour scheme, used when settings.appearance is 'device' */
  systemDark?: boolean;
  /** Space reserved for status bar / home indicator. The engine adds room for the running header and footer. */
  safeInsets?: { top: number; bottom: number };
  initialLocation?: BookLocation | { progress: number };
  highlights?: Highlight[];
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
  onLink?: (href: string) => void;
  onSearchResults?: (searchId: number, results: SearchResult[], done: boolean) => void;
  onEndReached?: (edge: 'start' | 'end') => void;
  onError?: (message: string) => void;
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

async function uriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onloadend = () => {
      const s = String(fr.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    fr.readAsDataURL(blob);
  });
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
  const opened = useRef(false);
  const selection = useRef<SelectionEvent | null>(null);
  const metaRef = useRef<BookMetadata>({ title: '', author: '', language: '', publisher: '' });

  const engineSettings = useMemo(
    () => toEngineSettings(settings, systemDark, safeInsets),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, systemDark, safeInsets.top, safeInsets.bottom]
  );

  const send = useCallback((cmd: object) => {
    web.current?.injectJavaScript(toScript(cmd));
  }, []);

  // open (or re-open) the book once the engine is up
  const sourceKey = 'uri' in source ? source.uri : source.base64.length + ':' + source.base64.slice(0, 32);
  useEffect(() => {
    if (!engineReady) return;
    let cancelled = false;
    opened.current = false;
    (async () => {
      try {
        const data = 'uri' in source ? await uriToBase64(source.uri) : source.base64;
        if (cancelled) return;
        send({
          cmd: 'open',
          data,
          settings: engineSettings,
          highlights: highlights || [],
          location: cb.current.initialLocation
        });
        opened.current = true;
      } catch (e) {
        cb.current.onError?.(String((e as Error)?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady, sourceKey]);

  useEffect(() => {
    if (opened.current) send({ cmd: 'settings', settings: engineSettings });
  }, [engineSettings, send]);

  useEffect(() => {
    if (opened.current) send({ cmd: 'highlights', list: highlights || [] });
  }, [highlights, send]);

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
    const p = cb.current;
    const d = msg.data;
    switch (msg.type) {
      case 'ready':
        setEngineReady(true);
        break;
      case 'metadata':
        metaRef.current = d;
        break;
      case 'toc':
        p.onReady?.({ metadata: metaRef.current, rtl: !!d.rtl });
        p.onToc?.(d.items);
        break;
      case 'cover':
        p.onCover?.(d.uri);
        break;
      case 'relocate':
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
        p.onLink?.(d.href);
        break;
      case 'searchResults':
        p.onSearchResults?.(d.id, d.results, d.done);
        break;
      case 'end':
        p.onEndReached?.(d.edge);
        break;
      case 'error':
        p.onError?.(d.message);
        break;
    }
  }, []);

  const bg = themeColors(settings, systemDark).bg;

  return (
    <View style={[styles.fill, { backgroundColor: bg }]}>
      <WebView
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
        menuItems={menuItems}
        onCustomMenuSelection={(e) => {
          const key = (e.nativeEvent as { key: string }).key;
          cb.current.onMenuAction?.(key, selection.current);
        }}
        onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || req.url.startsWith('data:') || req.url.startsWith('about:')}
        onError={(e) => cb.current.onError?.(e.nativeEvent.description)}
      />
    </View>
  );
});

const styles = StyleSheet.create({ fill: { flex: 1 } });
