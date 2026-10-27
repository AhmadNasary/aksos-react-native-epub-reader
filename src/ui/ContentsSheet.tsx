import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { HIGHLIGHT_COLORS } from '../themes';
import type { ChromeColors } from '../themes';
import type { Bookmark, Highlight, TocItem } from '../types';
import { Sheet } from './Sheet';

export type ContentsTab = 'contents' | 'bookmarks' | 'notes';

interface Props {
  visible: boolean;
  colors: ChromeColors;
  title: string;
  /** e.g. "Page 100 of 219" */
  subtitle: string;
  toc: TocItem[];
  currentSpine: number;
  /** estimated page number in the whole book for a spine item + character offset */
  pageOf: (spine: number, offset: number) => number;
  bookmarks: Bookmark[];
  highlights: Highlight[];
  initialTab?: ContentsTab;
  onClose: () => void;
  onGoToc: (item: TocItem) => void;
  onGoBookmark: (b: Bookmark) => void;
  onGoHighlight: (h: Highlight) => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
}

const TABS: { id: ContentsTab; label: string }[] = [
  { id: 'contents', label: 'Chapters' },
  { id: 'bookmarks', label: 'Bookmarks' },
  { id: 'notes', label: 'Highlights' }
];

/** Contents sheet: Chapters | Bookmarks | Highlights, each row with its page number. */
export function ContentsSheet(p: Props) {
  const { colors } = p;
  const [tab, setTab] = useState<ContentsTab>(p.initialTab || 'contents');
  const confirmDelete = (what: string, fn: () => void) =>
    Alert.alert(`Delete ${what}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: fn }
    ]);
  const empty = (text: string) => <Text style={[styles.empty, { color: colors.subtext }]}>{text}</Text>;
  const rowBorder = { borderColor: colors.separator };

  return (
    <Sheet visible={p.visible} colors={colors} onClose={p.onClose} closeIcon="check" title={p.title} subtitle={p.subtitle} height="90%">
      <View style={[styles.segment, { backgroundColor: colors.card }]}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[styles.segItem, tab === t.id && { backgroundColor: colors.dark ? 'rgba(255,255,255,0.22)' : '#ffffff' }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.id }}
          >
            <Text style={{ color: colors.text, fontWeight: tab === t.id ? '600' : '400', fontSize: 16 }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'contents' && (
        <FlatList
          data={p.toc}
          keyExtractor={(_, i) => String(i)}
          ListEmptyComponent={empty('No table of contents')}
          renderItem={({ item }) => {
            const active = item.spine === p.currentSpine && !item.fragment;
            return (
              <Pressable onPress={() => p.onGoToc(item)} style={[styles.row, rowBorder, { paddingStart: 20 + item.level * 18 }]}>
                <Text style={[styles.rowText, { color: active ? colors.accent : colors.text, flex: 1 }]} numberOfLines={2}>
                  {item.label}
                </Text>
                <Text style={[styles.page, { color: colors.subtext }]}>{p.pageOf(item.spine, 0)}</Text>
              </Pressable>
            );
          }}
        />
      )}

      {tab === 'bookmarks' && (
        <FlatList
          data={p.bookmarks.slice().sort((a, b) => a.progress - b.progress)}
          keyExtractor={(b) => b.id}
          ListEmptyComponent={empty('No bookmarks yet. Tap the bookmark button while reading.')}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => p.onGoBookmark(item)}
              onLongPress={() => confirmDelete('bookmark', () => p.onDeleteBookmark(item.id))}
              style={[styles.row, rowBorder]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.meta, { color: colors.accent }]}>{item.chapter}</Text>
                <Text style={[styles.rowText, { color: colors.text }]} numberOfLines={2}>
                  {item.excerpt}
                </Text>
              </View>
              <Text style={[styles.page, { color: colors.subtext }]}>{p.pageOf(item.spine, item.offset)}</Text>
            </Pressable>
          )}
        />
      )}

      {tab === 'notes' && (
        <FlatList
          data={p.highlights.slice().sort((a, b) => a.spine - b.spine || a.start - b.start)}
          keyExtractor={(h) => h.id}
          ListEmptyComponent={empty('No highlights or notes yet. Select text to add one.')}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => p.onGoHighlight(item)}
              onLongPress={() => confirmDelete('highlight', () => p.onDeleteHighlight(item.id))}
              style={[styles.row, rowBorder]}
            >
              <View style={[styles.bar, { backgroundColor: HIGHLIGHT_COLORS[item.color] }]} />
              <View style={{ flex: 1 }}>
                {!!item.note && <Text style={[styles.rowText, { color: colors.text, fontWeight: '600' }]}>{item.note}</Text>}
                <Text style={[styles.rowText, { color: item.note ? colors.subtext : colors.text }]} numberOfLines={3}>
                  {item.text}
                </Text>
                {!!item.chapter && <Text style={[styles.meta, { color: colors.subtext }]}>{item.chapter}</Text>}
              </View>
              <Text style={[styles.page, { color: colors.subtext }]}>{p.pageOf(item.spine, item.start)}</Text>
            </Pressable>
          )}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', marginHorizontal: 16, marginTop: 34, marginBottom: 6, borderRadius: 18, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 17, paddingHorizontal: 20, marginHorizontal: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontSize: 18, lineHeight: 24 },
  page: { fontSize: 18, marginStart: 12, minWidth: 34, textAlign: 'right' },
  meta: { fontSize: 13, marginBottom: 2, fontWeight: '600' },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginEnd: 12 },
  empty: { textAlign: 'center', padding: 32, fontSize: 16 }
});
