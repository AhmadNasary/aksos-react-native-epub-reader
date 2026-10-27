import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Bookmark, BookLocation, Highlight, ReaderSettings } from '../src';

export interface LibraryBook {
  id: string;
  title: string;
  uri: string;
  addedAt: number;
}

export interface BookState {
  location?: BookLocation & { progress: number };
  highlights: Highlight[];
  bookmarks: Bookmark[];
}

const LIBRARY = 'library:v1';
const SETTINGS = 'settings:v1';
const bookKey = (id: string) => `book:${id}`;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const loadLibrary = () => readJson<LibraryBook[]>(LIBRARY, []);
export const saveLibrary = (list: LibraryBook[]) => AsyncStorage.setItem(LIBRARY, JSON.stringify(list));

export const loadSettings = () => readJson<Partial<ReaderSettings>>(SETTINGS, {});
export const saveSettings = (s: ReaderSettings) => AsyncStorage.setItem(SETTINGS, JSON.stringify(s));

export const loadBookState = (id: string) => readJson<BookState>(bookKey(id), { highlights: [], bookmarks: [] });

/** Merge a partial update into the stored state for one book. */
export async function patchBookState(id: string, patch: Partial<BookState>) {
  const current = await loadBookState(id);
  await AsyncStorage.setItem(bookKey(id), JSON.stringify({ ...current, ...patch }));
}

export const removeBookState = (id: string) => AsyncStorage.removeItem(bookKey(id));
