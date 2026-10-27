# aksos-react-native-epub-reader

A complete EPUB reader for **React Native and Expo**, with the feel of a modern book app: real page curl, slide, fade and
continuous scroll, themes with light and dark variants, highlights, notes, bookmarks, whole-book search, a line guide, and
first-class **right-to-left** support (Pashto, Dari, Persian, Arabic, Urdu, Hebrew).

It is one component with a full reading UI (`EpubReaderView`), plus a headless engine (`EpubReader`) if you want to build your own.

- Works in **Expo Go**, Expo development builds and bare React Native (iOS and Android).
- No native code of its own: it uses `react-native-webview` and `react-native-svg`.
- You own the storage. The reader gives you the reading position, highlights, bookmarks and settings through callbacks.

---

## Contents

1. [Install](#install)
2. [Quick start](#quick-start)
3. [Saving and restoring](#saving-and-restoring)
4. [`EpubReaderView` props](#epubreaderview-props)
5. [Headless `EpubReader`](#headless-epubreader)
6. [Data types](#data-types)
7. [Settings reference](#settings-reference)
8. [Right-to-left books](#right-to-left-books)
9. [What the user can do](#what-the-user-can-do)
10. [Troubleshooting](#troubleshooting)
11. [Limitations](#limitations)
12. [Credits and license](#credits-and-license)

---

## Install

### Expo

```bash
npx expo install react-native-webview react-native-svg
npm install aksos-react-native-epub-reader
```

Optional, each one adds a feature and the reader simply works without it:

```bash
npx expo install expo-blur expo-audio expo-screen-orientation
```

| Package | Adds |
|---|---|
| `expo-blur` | frosted-glass controls and sheets (without it they are plain translucent) |
| `expo-audio` | the page-turn sound |
| `expo-screen-orientation` | the rotation-lock button |

> After installing a new package, restart Metro with a cleared cache: `npx expo start --clear`.

### Bare React Native

```bash
npm install aksos-react-native-epub-reader react-native-webview react-native-svg
cd ios && pod install
```

Add the optional packages above if you want those features.

### Opening files from the device

The reader takes a file URI or a base64 string. To let users pick a book, add a document picker:

```bash
npx expo install expo-document-picker expo-file-system
```

---

## Quick start

```tsx
import React from 'react';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { EpubReaderView } from 'aksos-react-native-epub-reader';

function Reader({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <EpubReaderView
      source={{ uri }}                       // file:// or http(s)://  (or { base64: '...' })
      safeInsets={{ top: insets.top, bottom: insets.bottom }}
      onClose={onClose}
    />
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Reader uri="file:///path/to/book.epub" onClose={() => {}} />
    </SafeAreaProvider>
  );
}
```

That is a complete reader: tap the middle of the page to show the controls, long-press a word to highlight.

### Pick a book from the device (Expo)

```tsx
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

async function importBook() {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/epub+zip', '*/*'], copyToCacheDirectory: true });
  if (res.canceled) return null;
  const dest = `${FileSystem.documentDirectory}${Date.now()}.epub`;
  await FileSystem.copyAsync({ from: res.assets[0].uri, to: dest });
  return dest;                              // pass as source={{ uri: dest }}
}
```

A complete example app (library, import, saving) is in [`example/`](example/).

---

## Saving and restoring

The reader never stores anything itself. Save what the callbacks give you, and pass it back next time:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (id: string) => `book:${id}`;

<EpubReaderView
  source={{ uri }}
  initialLocation={saved.location}        // { spine, offset }
  initialHighlights={saved.highlights}
  initialBookmarks={saved.bookmarks}
  initialSettings={saved.settings}        // partial ReaderSettings

  onLocationChange={(e) => save({ location: { spine: e.spine, offset: e.offset, progress: e.progress } })}
  onHighlightsChange={(list) => save({ highlights: list })}
  onBookmarksChange={(list) => save({ bookmarks: list })}
  onSettingsChange={(s) => save({ settings: s })}
/>
```

Locations are `{ spine, offset }`: the chapter number and a character offset inside it. They stay valid when the user
changes font size, theme or rotates the device.

`onLocationChange` fires on every page, so debounce the write (about 400 ms is plenty). The example app does this in
[`example/App.tsx`](example/App.tsx).

---

## `EpubReaderView` props

| Prop | Type | Description |
|---|---|---|
| `source` | `{ uri: string } \| { base64: string }` | **Required.** The EPUB. |
| `title` | `string` | Shown in Contents until the book's own title is read. |
| `safeInsets` | `{ top: number; bottom: number }` | Status-bar and home-indicator space. Use `useSafeAreaInsets()`. |
| `initialLocation` | `{ spine: number; offset: number }` | Where to open. Defaults to the start. |
| `initialSettings` | `Partial<ReaderSettings>` | Theme, font, size, spacing ... |
| `initialHighlights` | `Highlight[]` | |
| `initialBookmarks` | `Bookmark[]` | |
| `onClose` | `() => void` | The X button. |
| `onLocationChange` | `(e: RelocateEvent) => void` | Every page turn. Has `spine`, `offset`, `progress` (0..1), `page`, `pageCount`, `chapter`. |
| `onHighlightsChange` | `(list: Highlight[]) => void` | After any create / edit / delete. |
| `onBookmarksChange` | `(list: Bookmark[]) => void` | |
| `onSettingsChange` | `(s: ReaderSettings) => void` | |
| `onMetadata` | `(m: BookMetadata) => void` | `title`, `author`, `language`, `publisher`. |
| `onCover` | `(dataUri: string) => void` | The cover image, if the book has one. |
| `onError` | `(message: string) => void` | Unreadable file, DRM, ... |

---

## Headless `EpubReader`

`EpubReader` is only the page engine, with no buttons and no sheets. Use it to build your own interface.

```tsx
import { EpubReader, DEFAULT_SETTINGS } from 'aksos-react-native-epub-reader';
import type { EpubReaderHandle } from 'aksos-react-native-epub-reader';

const ref = useRef<EpubReaderHandle>(null);

<EpubReader
  ref={ref}
  source={{ uri }}
  settings={{ ...DEFAULT_SETTINGS, themeId: 'calm', fontSize: 21 }}
  systemDark={useColorScheme() === 'dark'}
  safeInsets={{ top: 50, bottom: 30 }}
  highlights={highlights}
  onRelocate={(e) => console.log(e.chapter, e.progress)}
  onSelection={(sel) => sel && console.log(sel.text)}   // sel.start / sel.end / sel.rect
  onTap={() => toggleMyControls()}
  onToc={(items) => setToc(items)}
/>

ref.current?.next();
ref.current?.prev();
ref.current?.goTo({ spine: 3 });
ref.current?.goTo({ spine: 3, fragment: 'section-2' });
ref.current?.goTo({ progress: 0.5 });                    // 0..1 across the whole book
ref.current?.search('word', 1);                          // results arrive in onSearchResults(1, results, done)
ref.current?.showSearchResult(result);
ref.current?.clearSelection();
ref.current?.setLabels('Chapter 3', '42 of 300');        // running header / footer drawn on the page
```

Extra callbacks: `onReady`, `onCover`, `onIndexed`, `onHighlightTap`, `onLink`, `onSearchResults`, `onEndReached`, `onPageTurn`, `onError`.

---

## Data types

```ts
interface Highlight {
  id: string; spine: number; start: number; end: number;   // character offsets in that chapter
  text: string; color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  style?: 'highlight' | 'underline'; note?: string; chapter?: string; createdAt: number;
}

interface Bookmark {
  id: string; spine: number; offset: number; chapter: string; excerpt: string; progress: number; createdAt: number;
}

interface RelocateEvent {
  spine: number; offset: number; end: number; page: number; pageCount: number; spineCount: number;
  textLength: number; progress: number; chapter: string; excerpt: string; indexed: boolean;
}
```

All types are exported: `import type { Highlight, Bookmark, ReaderSettings, TocItem, ... } from 'aksos-react-native-epub-reader'`.

---

## Settings reference

`ReaderSettings` (all optional in `initialSettings`; defaults are in `DEFAULT_SETTINGS`):

| Field | Values | Default |
|---|---|---|
| `themeId` | `original` `quiet` `paper` `bold` `calm` `focus` | `original` |
| `appearance` | `light` `dark` `device` | `device` |
| `fontId` | `original` (the book's own) `system` `newyork` `athelas` `charter` `georgia` `iowan` `palatino` `seravek` `times` `naskh` | `original` |
| `fontSize` | 12 - 40 | `19` |
| `bold` | `boolean` | `false` |
| `customize` | turns on the spacing values below | `false` |
| `lineHeight` | 1.1 - 2.2 | `1.5` |
| `letterSpacing` / `wordSpacing` | -50 .. 100 (percent) | `0` |
| `margins` | -50 .. 100 (percent) | `0` |
| `columns` | `auto` `1` `2` | `auto` |
| `justify` | `boolean` | `false` |
| `pageTurn` | `slide` `curl` `fade` `scroll` | `slide` |
| `pageSound` | paper sound on page turns | `true` |
| `brightness` | 0.3 - 1 | `1` |
| `direction` | `auto` `ltr` `rtl` | `auto` |

Exported helpers: `THEMES`, `FONTS`, `HIGHLIGHT_COLORS`, `DEFAULT_SETTINGS`, `getTheme(id)`, `getFont(id)`, `chromeColors(...)`.

> The fonts are CSS stacks, so what you see depends on the device. `original` always uses the fonts inside the book.
> For Pashto / Arabic text, `naskh` asks for Noto Naskh, Geeza Pro or Scheherazade.

---

## Right-to-left books

Direction is detected automatically, in this order:

1. `page-progression-direction` in the book,
2. the book's language (`ps`, `fa`, `ar`, `ur`, `he`, ...),
3. **the text itself**: if the first chapters are mostly Arabic script, the book is treated as right-to-left, even when
   the metadata says English. (Many Pashto and Dari EPUBs have wrong or missing language tags.)

In a right-to-left book pages turn from left to right, taps and swipes are mirrored, the progress bar fills from the right,
and the page curl folds the other way. Set `settings.direction` to `ltr` or `rtl` to override the detection.

---

## What the user can do

- **Turn pages** with a tap on the left or right edge, or a swipe. Choose Slide, Curl (a real corner fold, following the finger),
  Fast Fade or Scroll (continuous, chapter after chapter).
- **Tap the middle** to show the controls: close, Contents (chapters, bookmarks, highlights with page numbers), Search Book,
  Themes & Settings, Customize, share, rotation lock, Line Guide, bookmark.
- **Long-press a word** and drag to select, then choose **Highlight** or **Note**. Tap a highlight to change its colour,
  underline it, edit the note or delete it.
- **Line Guide** dims everything except one line that can be dragged.
- **Links** inside the book work; external links open in the browser.

---

## Troubleshooting

**"Unable to resolve module" right after installing a package.** Metro has a stale cache: `npx expo start --clear`.

**No page-turn sound.** Install `expo-audio`, turn up the media volume, and check the iPhone silent switch.
The sound can be disabled by the user in Themes & Settings, Customize.

**Controls are not blurred on Android.** `expo-blur` blur is limited on Android; the controls fall back to translucent colour.

**A book will not open.** `onError` receives the reason. DRM-protected files (Adobe, Apple FairPlay) cannot be opened.

**Opening is slow for a very large book.** The file is sent to the page engine as base64. Typical novels take well under
a second; a 50 MB illustrated book will be slow.

---

## Limitations

- Reflowable EPUBs only. Fixed-layout EPUBs and media overlays are not supported.
- Themes and fonts are chosen from the built-in lists (no custom theme prop yet).
- Embedded fonts that are obfuscated by the publisher fall back to a system font.
- Text selection and highlights work in the chapter that is on screen; in Scroll mode a neighbouring chapter becomes
  selectable once it scrolls into the middle of the screen.
- Search folds case and common Arabic / Persian letter variants (for example ي and ی) but does not strip diacritics.
- The page curl is a geometric corner fold, not a physical simulation of paper.

---

## Credits and license

MIT, see [LICENSE](LICENSE).

The page-turn sounds (`src/assets/page-turn-*.wav`) are trimmed and softened recordings from
"10 Book Page Flips" by StarNinjas (https://opengameart.org/content/10-book-page-flips), released under CC0.

EPUB parsing uses [JSZip](https://stuk.github.io/jszip/).

### Developing

```bash
npm install
npm run build:engine     # rebuilds src/engine/html.ts from src/engine/reader.js
npm run build:lib        # compiles src/ to lib/
npm run typecheck
```

The reading engine is plain JavaScript in `src/engine/reader.js`, bundled with JSZip into a single HTML page for the WebView.
`test/serve.js` serves that page in a browser together with sample books (`node test/make-epub.js` creates them).
