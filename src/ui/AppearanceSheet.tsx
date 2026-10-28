import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isDark, serifFont, THEMES } from '../themes';
import type { ChromeColors } from '../themes';
import type { Appearance, PageTurn, ReaderSettings } from '../types';
import { useLabels } from '../strings';
import type { ReaderLabels } from '../strings';
import { Icon } from './Icons';
import type { IconName } from './Icons';
import { Sheet } from './Sheet';
import { Slider } from './Slider';

interface Props {
  visible: boolean;
  colors: ChromeColors;
  settings: ReaderSettings;
  systemDark: boolean;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onCustomize: () => void;
  onClose: () => void;
}

const SIZE = { min: 12, max: 40, step: 2 };

const TURNS: { id: PageTurn; label: keyof ReaderLabels; icon: IconName }[] = [
  { id: 'slide', label: 'slide', icon: 'pageSlide' },
  { id: 'curl', label: 'curl', icon: 'pageCurl' },
  { id: 'fade', label: 'fastFade', icon: 'pageFade' },
  { id: 'scroll', label: 'scrollMode', icon: 'pageScroll' }
];

const APPEARANCES: { id: Appearance; label: keyof ReaderLabels; icon: IconName; key: string }[] = [
  { id: 'light', label: 'light', icon: 'sun', key: 'light' },
  { id: 'dark', label: 'dark', icon: 'moon', key: 'dark' },
  { id: 'device', label: 'matchDevice', icon: 'contrast', key: 'device' },
  { id: 'device', label: 'matchSurroundings', icon: 'sunLow', key: 'surroundings' }
];

/** Icon of the current appearance choice: the button always shows the state it is in. */
const appearanceIcon = (a: Appearance): IconName => (a === 'light' ? 'sun' : a === 'dark' ? 'moon' : 'contrast');

/** "Themes & Settings" sheet. */
export function AppearanceSheet({ visible, colors, settings: s, systemDark, onChange, onCustomize, onClose }: Props) {
  const L = useLabels();
  const [menu, setMenu] = useState<null | 'turn' | 'appearance'>(null);
  // a popup left open must not reappear the next time the sheet is shown
  useEffect(() => {
    if (!visible) setMenu(null);
  }, [visible]);
  const dark = isDark(s, systemDark);
  const turn = TURNS.find((t) => t.id === s.pageTurn) || TURNS[0];

  const menuView = menu && (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} />
      <View style={[styles.menu, { backgroundColor: colors.dark ? '#4a4742' : '#ffffff', borderColor: colors.glassBorder }]}>
        {menu === 'turn'
          ? TURNS.map((t) => (
              <Pressable
                key={t.id}
                style={styles.menuItem}
                onPress={() => {
                  onChange({ pageTurn: t.id });
                  setMenu(null);
                }}
              >
                <View style={styles.check}>{s.pageTurn === t.id && <Icon name="check" color={colors.text} size={20} />}</View>
                <Icon name={t.icon} color={colors.text} size={24} />
                <Text style={[styles.menuText, { color: colors.text }]}>{L[t.label] as string}</Text>
              </Pressable>
            ))
          : APPEARANCES.map((a) => (
              <Pressable
                key={a.key}
                style={styles.menuItem}
                onPress={() => {
                  onChange({ appearance: a.id });
                  setMenu(null);
                }}
              >
                <View style={styles.check}>{s.appearance === a.id && a.key !== 'surroundings' && <Icon name="check" color={colors.text} size={20} />}</View>
                <Icon name={a.icon} color={colors.text} size={24} />
                <Text style={[styles.menuText, { color: colors.text }]}>{L[a.label] as string}</Text>
              </Pressable>
            ))}
      </View>
    </>
  );

  return (
    <Sheet visible={visible} colors={colors} onClose={onClose} title={L.themesSettings} height="auto" overlay={menuView || undefined}>
      <View style={styles.body}>
        <View style={styles.row}>
          <View style={[styles.pill, { flex: 1, backgroundColor: colors.card }]}>
            <Pressable
              style={styles.half}
              onPress={() => onChange({ fontSize: Math.max(SIZE.min, s.fontSize - SIZE.step) })}
              accessibilityRole="button"
              accessibilityLabel={L.smallerText}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>A</Text>
            </Pressable>
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <Pressable
              style={styles.half}
              onPress={() => onChange({ fontSize: Math.min(SIZE.max, s.fontSize + SIZE.step) })}
              accessibilityRole="button"
              accessibilityLabel={L.largerText}
            >
              <Text style={{ color: colors.text, fontSize: 26, fontWeight: '500' }}>A</Text>
            </Pressable>
          </View>
          <View style={[styles.pill, { width: 150, backgroundColor: colors.card }]}>
            <Pressable style={[styles.half, menu === 'turn' && { backgroundColor: colors.separator }]} onPress={() => setMenu(menu === 'turn' ? null : 'turn')} accessibilityRole="button" accessibilityLabel={`${L.pageTurnStyle}: ${L[turn.label] as string}`}>
              <Icon name={turn.icon} color={colors.text} size={26} />
            </Pressable>
            <Pressable style={[styles.half, menu === 'appearance' && { backgroundColor: colors.separator }]} onPress={() => setMenu(menu === 'appearance' ? null : 'appearance')} accessibilityRole="button" accessibilityLabel={L.appearance}>
              <Icon name={appearanceIcon(s.appearance)} color={colors.text} size={26} />
            </Pressable>
          </View>
        </View>

        <View style={styles.brightness}>
          <Icon name="sunLow" color={colors.subtext} size={20} />
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Slider value={s.brightness} min={0.3} max={1} step={0.01} onChange={(v) => onChange({ brightness: v })} color={colors.text} track={colors.separator} thumbColor="#ffffff" />
          </View>
          <Icon name="sun" color={colors.subtext} size={26} />
        </View>

        <View style={styles.grid}>
          {THEMES.map((t) => {
            const c = dark ? t.dark : t.light;
            const on = t.id === s.themeId;
            return (
              <Pressable
                key={t.id}
                onPress={() => onChange({ themeId: t.id })}
                style={[styles.tile, { backgroundColor: c.bg, borderColor: on ? colors.text : colors.separator, borderWidth: on ? 3 : StyleSheet.hairlineWidth }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={{ color: c.fg, fontSize: 30, fontFamily: serifFont, fontWeight: t.bold ? '800' : '400' }}>Aa</Text>
                <Text style={{ color: c.fg, fontSize: 15, fontFamily: serifFont, fontWeight: t.bold ? '700' : '400' }}>{t.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={onCustomize} style={[styles.customize, { backgroundColor: colors.card }]} accessibilityRole="button">
          <Icon name="sliders" color={colors.text} size={22} />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginStart: 10 }}>{L.customize}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  row: { flexDirection: 'row', gap: 10 },
  pill: { height: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  half: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 24 },
  brightness: { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 8, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  tile: { width: '31.6%', height: 92, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  customize: { marginTop: 12, height: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute', top: 80, right: 16, width: 250, borderRadius: 24, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  check: { width: 26, alignItems: 'center' },
  menuText: { fontSize: 18, marginStart: 14, flexShrink: 1 }
});
