import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { EpubReaderView } from '../src';
import type { ReaderSettings } from '../src';
import { loadBookState, loadLibrary, loadSettings, patchBookState, removeBookState, saveLibrary, saveSettings } from './storage';
import type { BookState, LibraryBook } from './storage';

const SAMPLE_ID = 'sample';

// ------------------------------------------------------------------ reader

function ReaderScreen({ book, onClose, onTitle }: { book: LibraryBook; onClose: () => void; onTitle: (title: string) => void }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<BookState | null>(null);
  const [settings, setSettings] = useState<Partial<ReaderSettings> | null>(null);
  const latest = useRef<BookState>({ highlights: [], bookmarks: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    Promise.all([loadBookState(book.id), loadSettings()]).then(([s, set]) => {
      latest.current = s;
      setState(s);
      setSettings(set);
    });
  }, [book.id]);

  // One writer per book: keep the whole state in memory and flush it debounced, so
  // location, highlight and bookmark updates can never overwrite each other.
  const persist = useCallback(
    (patch: Partial<BookState>) => {
      latest.current = { ...latest.current, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => patchBookState(book.id, latest.current), 400);
    },
    [book.id]
  );
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      patchBookState(book.id, latest.current);
    },
    [book.id]
  );

  if (!state || !settings) return <ActivityIndicator style={styles.center} />;

  return (
    <EpubReaderView
      source={{ uri: book.uri }}
      title={book.title}
      safeInsets={{ top: insets.top, bottom: insets.bottom }}
      initialLocation={state.location ? { spine: state.location.spine, offset: state.location.offset } : undefined}
      initialSettings={settings}
      initialHighlights={state.highlights}
      initialBookmarks={state.bookmarks}
      onClose={onClose}
      onMetadata={(m) => m.title && m.title !== book.title && onTitle(m.title)}
      onLocationChange={(e) => persist({ location: { spine: e.spine, offset: e.offset, progress: e.progress } })}
      onHighlightsChange={(highlights) => persist({ highlights })}
      onBookmarksChange={(bookmarks) => persist({ bookmarks })}
      onSettingsChange={saveSettings}
      onError={(m) => console.warn('[epub]', m)}
    />
  );
}

// ----------------------------------------------------------------- library

function LibraryScreen({ onOpen }: { onOpen: (b: LibraryBook) => void }) {
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadLibrary().then(setBooks);
  }, []);

  const update = (next: LibraryBook[]) => {
    setBooks(next);
    saveLibrary(next);
  };
  const add = (book: LibraryBook) => {
    const rest = (books || []).filter((b) => b.id !== book.id);
    update([book, ...rest]);
    onOpen(book);
  };

  const importFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/epub+zip', '*/*'], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      if (!/\.epub$/i.test(file.name)) {
        Alert.alert('Not an EPUB', 'Please choose a file ending in .epub');
        return;
      }
      setBusy(true);
      const id = Date.now().toString(36);
      const dest = `${FileSystem.documentDirectory}${id}.epub`;
      await FileSystem.copyAsync({ from: file.uri, to: dest });
      add({ id, title: file.name.replace(/\.epub$/i, ''), uri: dest, addedAt: Date.now() });
    } catch (e) {
      Alert.alert('Could not import', String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const openSample = async () => {
    try {
      setBusy(true);
      const asset = Asset.fromModule(require('./assets/sample.epub'));
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('Sample asset not available');
      add({ id: SAMPLE_ID, title: 'Sample Book', uri: asset.localUri, addedAt: Date.now() });
    } catch (e) {
      Alert.alert('Could not open sample', String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (b: LibraryBook) =>
    Alert.alert(`Remove "${b.title}"?`, 'Its highlights, bookmarks and position are deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          update((books || []).filter((x) => x.id !== b.id));
          await removeBookState(b.id);
          if (b.id !== SAMPLE_ID) await FileSystem.deleteAsync(b.uri, { idempotent: true });
        }
      }
    ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
      <Text style={styles.h1}>Library</Text>
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={importFile} disabled={busy}>
          <Text style={styles.primaryText}>Open EPUB…</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={openSample} disabled={busy}>
          <Text style={styles.secondaryText}>Sample book</Text>
        </Pressable>
        {busy && <ActivityIndicator style={{ marginStart: 8 }} />}
      </View>
      <FlatList
        data={books || []}
        keyExtractor={(b) => b.id}
        ListEmptyComponent={<Text style={styles.empty}>{books ? 'No books yet. Open an EPUB or try the sample.' : ''}</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onOpen(item)} onLongPress={() => remove(item)}>
            <View style={styles.cover}>
              <Text style={styles.coverText}>{item.title.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

// --------------------------------------------------------------------- app

function Root() {
  const [open, setOpen] = useState<LibraryBook | null>(null);

  const renameInLibrary = useCallback((id: string, title: string) => {
    loadLibrary().then((list) => saveLibrary(list.map((b) => (b.id === id ? { ...b, title } : b))));
  }, []);

  if (open) {
    return (
      <ReaderScreen
        key={open.id}
        book={open}
        onClose={() => setOpen(null)}
        onTitle={(t) => {
          renameInLibrary(open.id, t);
          setOpen({ ...open, title: t });
        }}
      />
    );
  }
  return <LibraryScreen key="library" onOpen={setOpen} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Root />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#f2f2f7', paddingHorizontal: 20 },
  h1: { fontSize: 32, fontWeight: '800', marginBottom: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  primary: { backgroundColor: '#ff9500', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginEnd: 10 },
  primaryText: { color: '#ffffff', fontWeight: '600', fontSize: 16 },
  secondary: { backgroundColor: '#e5e5ea', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  secondaryText: { color: '#000000', fontSize: 16 },
  empty: { color: '#6c6c70', textAlign: 'center', marginTop: 48, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  cover: { width: 48, height: 68, borderRadius: 4, backgroundColor: '#c0392b', alignItems: 'center', justifyContent: 'center', marginEnd: 14 },
  coverText: { color: '#ffffff', fontSize: 24, fontWeight: '700' },
  rowTitle: { flex: 1, fontSize: 17, fontWeight: '500' }
});
