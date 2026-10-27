import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

export type DimLevel = 'high' | 'medium' | 'low' | 'none';

/** Opacity of the page-coloured veil over everything except the guide line. */
export const DIM_ALPHA: Record<DimLevel, number> = { high: 0.86, medium: 0.62, low: 0.36, none: 0 };

function rgba(hex: string, a: number): string {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${v[0]},${v[1]},${v[2]},${a})`;
}

interface Props {
  /** page background colour (#rrggbb) */
  bg: string;
  dark: boolean;
  dim: DimLevel;
  /** height of one line of text */
  lineHeight: number;
  /** vertical range the guide may move in */
  minY: number;
  maxY: number;
}

/**
 * Line Guide: dims the page except for one line that can be dragged up and down.
 * The veil ignores touches, so page turns and taps still reach the book.
 */
export function LineGuide({ bg, dark, dim, lineHeight, minY, maxY }: Props) {
  const h = Math.round(lineHeight) + 14;
  const [y, setY] = useState(minY + 40);
  const state = useRef({ start: 0, minY, maxY, h });
  state.current.minY = minY;
  state.current.maxY = maxY;
  state.current.h = h;
  const yRef = useRef(y);
  yRef.current = y;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        state.current.start = yRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const s = state.current;
        setY(Math.max(s.minY, Math.min(s.maxY - s.h, s.start + g.dy)));
      }
    })
  ).current;

  const veil = rgba(bg, DIM_ALPHA[dim]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {dim !== 'none' && (
        <>
          <View pointerEvents="none" style={[styles.veil, { top: 0, height: y, backgroundColor: veil }]} />
          <View pointerEvents="none" style={[styles.veil, { top: y + h, bottom: 0, backgroundColor: veil }]} />
        </>
      )}
      <View
        {...pan.panHandlers}
        style={[
          styles.band,
          {
            top: y,
            height: h,
            borderRadius: h / 2,
            borderColor: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.22)',
            backgroundColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
          }
        ]}
        accessibilityLabel="Line guide"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  veil: { position: 'absolute', left: 0, right: 0 },
  band: {
    position: 'absolute', left: 10, right: 10, borderWidth: StyleSheet.hairlineWidth * 2,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6
  }
});
