import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ChromeColors } from '../themes';
import type { SearchResult } from '../types';
import { Icon } from './Icons';
import { Sheet } from './Sheet';

interface Props {
  visible: boolean;
  colors: ChromeColors;
  results: SearchResult[];
  searching: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  onPick: (r: SearchResult) => void;
}

export function SearchSheet({ visible, colors, results, searching, onClose, onSearch, onPick }: Props) {
  const [q, setQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(q), 350);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <Sheet visible={visible} colors={colors} onClose={onClose} height="85%" title="Search">
      <View style={[styles.field, { backgroundColor: colors.card }]}>
        <Icon name="search" color={colors.subtext} size={20} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search in book"
          placeholderTextColor={colors.subtext}
          style={[styles.input, { color: colors.text }]}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => onSearch(q)}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={results}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(_, i) => String(i)}
        ListHeaderComponent={
          q.trim().length >= 2 ? (
            <Text style={[styles.count, { color: colors.subtext }]}>
              {searching ? 'Searching...' : `${results.length}${results.length >= 500 ? '+' : ''} results`}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onPick(item)} style={[styles.row, { borderColor: colors.separator }]}>
            <Text style={[styles.chapter, { color: colors.accent }]} numberOfLines={1}>
              {item.chapter}
            </Text>
            <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }} numberOfLines={3}>
              {item.before}
              <Text style={{ fontWeight: '700', backgroundColor: 'rgba(255,214,10,0.45)' }}>{item.match}</Text>
              {item.after}
            </Text>
          </Pressable>
        )}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 10, borderRadius: 10, height: 38 },
  input: { flex: 1, marginStart: 6, fontSize: 16, paddingVertical: 0 },
  count: { paddingHorizontal: 20, paddingVertical: 8, fontSize: 13 },
  row: { paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  chapter: { fontSize: 12, fontWeight: '600', marginBottom: 3 }
});
