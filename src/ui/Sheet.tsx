import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { ChromeColors } from '../themes';
import { Glass } from './Glass';
import { Icon } from './Icons';

interface Props {
  visible: boolean;
  title?: string;
  subtitle?: string;
  colors: ChromeColors;
  height?: ViewStyle['height'];
  /** 'x' puts a glass close button on the left (Themes, Search); 'check' puts a solid check on the right (Contents, Customize) */
  closeIcon?: 'x' | 'check';
  onClose: () => void;
  children: React.ReactNode;
  /** rendered above the content, e.g. popup menus */
  overlay?: React.ReactNode;
}

/** Rounded frosted-glass sheet: the book stays faintly visible behind it. */
export function Sheet({ visible, title, subtitle, colors, height = '70%', closeIcon = 'x', onClose, children, overlay }: Props) {
  const button =
    closeIcon === 'check' ? (
      <Pressable onPress={onClose} hitSlop={10} style={[styles.circle, { backgroundColor: colors.dark ? '#ffffff' : '#000000' }]} accessibilityRole="button" accessibilityLabel="Done">
        <Icon name="check" color={colors.dark ? '#000000' : '#ffffff'} size={24} strokeWidth={2.2} />
      </Pressable>
    ) : (
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
        <Glass dark={colors.dark} background={colors.glass} border={colors.glassBorder} style={styles.circle}>
          <Icon name="close" color={colors.text} size={22} />
        </Glass>
      </Pressable>
    );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Glass dark={colors.dark} background={colors.sheetGlass} border={colors.glassBorder} intensity={70} style={[styles.sheet, { height }]}>
        <View style={styles.header}>
          {closeIcon === 'x' && button}
          <View style={styles.titleBox} pointerEvents="none">
            {!!title && (
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {title}
              </Text>
            )}
            {!!subtitle && <Text style={[styles.subtitle, { color: colors.text }]}>{subtitle}</Text>}
          </View>
          <View style={{ flex: 1 }} />
          {closeIcon === 'check' && button}
        </View>
        {children}
        {overlay}
      </Glass>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' },
  sheet: { borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 52, marginBottom: 6 },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titleBox: { position: 'absolute', left: 70, right: 70, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '600' },
  subtitle: { fontSize: 17, marginTop: 14 }
});
