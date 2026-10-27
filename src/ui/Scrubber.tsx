import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

interface Props {
  value: number; // 0..1
  onScrub?: (v: number) => void;
  onComplete: (v: number) => void;
  color: string;
  track: string;
  thumbColor?: string;
  /** hide the thumb for a flat progress bar */
  noThumb?: boolean;
  rtl?: boolean;
}

/** Minimal horizontal slider (no native dependency). */
export function Scrubber({ value, onScrub, onComplete, color, track, thumbColor, noThumb, rtl }: Props) {
  const [width, setWidth] = useState(1);
  const [drag, setDrag] = useState<number | null>(null);
  const latest = useRef({ width: 1, onScrub, onComplete, rtl });
  latest.current = { width, onScrub, onComplete, rtl };
  const startX = useRef(0);

  const toValue = (x: number) => {
    const { width: w, rtl: r } = latest.current;
    const v = Math.max(0, Math.min(1, x / w));
    return r ? 1 - v : v;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        const v = toValue(startX.current);
        setDrag(v);
        latest.current.onScrub?.(v);
      },
      onPanResponderMove: (_e, g) => {
        const v = toValue(startX.current + g.dx);
        setDrag(v);
        latest.current.onScrub?.(v);
      },
      onPanResponderRelease: (_e, g) => {
        const v = toValue(startX.current + g.dx);
        setDrag(null);
        latest.current.onComplete(v);
      }
    })
  ).current;

  const shown = drag ?? value;
  const frac = rtl ? 1 - shown : shown;
  return (
    <View style={styles.hit} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
      <View style={[styles.track, { backgroundColor: track }]} pointerEvents="none">
        <View style={{ height: 4, backgroundColor: color, width: `${frac * 100}%` }} />
      </View>
      {!noThumb && (
        <View
          pointerEvents="none"
          style={[styles.thumb, { backgroundColor: thumbColor || color, left: Math.max(0, Math.min(width - 28, frac * (width - 28))) }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 40, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', flexDirection: 'row' },
  thumb: {
    position: 'absolute', width: 28, height: 28, borderRadius: 14, top: 6,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3
  }
});
