import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HIGHLIGHT_COLORS } from '../themes';
import type { ChromeColors } from '../themes';
import type { Highlight, HighlightColor } from '../types';
import { Glass } from './Glass';
import { Icon } from './Icons';

interface Props {
  highlight: Highlight;
  rect: { x: number; y: number; width: number; height: number };
  screen: { width: number; height: number };
  colors: ChromeColors;
  onColor: (c: HighlightColor) => void;
  onToggleUnderline: () => void;
  onNote: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

const W = 316;
const H = 50;

/** Floating glass palette shown over a highlight, like Apple Books. */
export function HighlightMenu({ highlight, rect, screen, colors, onColor, onToggleUnderline, onNote, onDelete, onDismiss }: Props) {
  const left = Math.max(8, Math.min(screen.width - W - 8, rect.x + rect.width / 2 - W / 2));
  const above = rect.y - H - 10;
  const top = above > 60 ? above : rect.y + rect.height + 10;
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
      <Glass dark={colors.dark} background={colors.sheetGlass} border={colors.glassBorder} intensity={55} style={[styles.menu, { left, top }]}>
        {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
          <Pressable key={c} onPress={() => onColor(c)} hitSlop={4} accessibilityLabel={`${c} highlight`}>
            <View style={[styles.dot, { backgroundColor: HIGHLIGHT_COLORS[c], borderWidth: highlight.color === c ? 2 : 0, borderColor: colors.text }]} />
          </Pressable>
        ))}
        <Pressable onPress={onToggleUnderline} hitSlop={6} accessibilityLabel="Underline">
          <Icon name="underline" color={colors.text} size={22} active={highlight.style === 'underline'} strokeWidth={highlight.style === 'underline' ? 2.4 : 1.8} />
        </Pressable>
        <Pressable onPress={onNote} hitSlop={6} accessibilityLabel="Note">
          <Icon name="pencil" color={colors.text} size={22} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={6} accessibilityLabel="Remove highlight">
          <Icon name="trash" color="#ff3b30" size={22} />
        </Pressable>
      </Glass>
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: W,
    height: H,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12
  },
  dot: { width: 26, height: 26, borderRadius: 13 }
});
