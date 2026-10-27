import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

// expo-blur is optional: with it the controls are frosted glass, without it they are plain translucent.
let BlurView: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BlurView = require('expo-blur').BlurView;
} catch {
  BlurView = null;
}

interface Props {
  style?: StyleProp<ViewStyle>;
  /** translucent tint drawn over the blur (use ChromeColors.glass or .sheetGlass) */
  background: string;
  border?: string;
  dark: boolean;
  /** blur strength 0..100 */
  intensity?: number;
  children?: React.ReactNode;
}

/** Frosted glass surface: blurs the book behind it so reading is not interrupted. */
export function Glass({ style, background, border, dark, intensity = 38, children }: Props) {
  const base: ViewStyle = { overflow: 'hidden', borderWidth: border ? StyleSheet.hairlineWidth : 0, borderColor: border };
  if (BlurView) {
    return (
      <BlurView intensity={intensity} tint={dark ? 'dark' : 'light'} style={[base, style]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: background }]} pointerEvents="none" />
        {children}
      </BlurView>
    );
  }
  return <View style={[base, { backgroundColor: background }, style]}>{children}</View>;
}
