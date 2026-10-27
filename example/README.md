# Example app (Expo)

A small library + reader app built on `EpubReaderView`.

```bash
cd example
npm install
npx expo start      # press i / a, or scan the QR code with a development build
```

`react-native-webview` is a native module, so use a **development build** (`npx expo run:ios` / `run:android`)
if Expo Go does not include the version you need.

## What it shows

* **Open EPUB…** picks a file (`expo-document-picker`), copies it to the app's document directory.
* **Sample book** opens the bundled `assets/sample.epub`.
* Tap a book to read it; long-press a book in the library to remove it.
* Persisted per book in AsyncStorage (`storage.ts`):
  reading position (`{spine, offset}`), highlights and notes, bookmarks.
  Appearance settings (theme, font, size, ...) are shared by all books.
* `App.tsx` keeps one in-memory state per open book and flushes it debounced (400 ms) and on close,
  so a page turn, a new highlight and a bookmark can never overwrite each other.

Metro is configured (`metro.config.js`) to bundle the library straight from `../src`.
