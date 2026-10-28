import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ChromeColors } from '../themes';
import { useLabels } from '../strings';

interface Props {
  visible: boolean;
  quote: string;
  initial: string;
  colors: ChromeColors;
  onSave: (note: string) => void;
  onCancel: () => void;
}

export function NoteEditor({ visible, quote, initial, colors, onSave, onCancel }: Props) {
  const L = useLabels();
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial, visible]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={[styles.card, { backgroundColor: colors.sheet }]}>
          <View style={styles.head}>
            <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button">
              <Text style={{ color: colors.accent, fontSize: 17 }} maxFontSizeMultiplier={1.4}>{L.cancel}</Text>
            </Pressable>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }} maxFontSizeMultiplier={1.4}>{L.note}</Text>
            <Pressable onPress={() => onSave(text.trim())} hitSlop={12} accessibilityRole="button">
              <Text style={{ color: colors.accent, fontSize: 17, fontWeight: '600' }} maxFontSizeMultiplier={1.4}>{L.save}</Text>
            </Pressable>
          </View>
          <Text numberOfLines={3} style={[styles.quote, { color: colors.subtext, borderColor: colors.accent }]}>
            {quote}
          </Text>
          <TextInput
            autoFocus
            multiline
            value={text}
            onChangeText={setText}
            placeholder={L.addANote}
            placeholderTextColor={colors.subtext}
            style={[styles.input, { color: colors.text, backgroundColor: colors.card }]}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  card: { borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  quote: { fontSize: 14, borderStartWidth: 3, paddingStart: 10, marginBottom: 12, fontStyle: 'italic' },
  input: { minHeight: 110, maxHeight: 220, borderRadius: 10, padding: 12, fontSize: 16, textAlignVertical: 'top' }
});
