import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { FONTS, getFont, serifFont } from '../themes';
import type { ChromeColors } from '../themes';
import type { ColumnsSetting, ReaderSettings, ThemeColors } from '../types';
import { useLabels } from '../strings';
import { Icon } from './Icons';
import type { IconName } from './Icons';
import { Sheet } from './Sheet';
import { Slider } from './Slider';

interface Props {
  visible: boolean;
  colors: ChromeColors;
  page: ThemeColors;
  settings: ReaderSettings;
  sample: string;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const GREEN = { true: '#34c759' };

function Toggle(props: React.ComponentProps<typeof Switch>) {
  return (
    <View style={styles.toggleBox}>
      <Switch {...props} />
    </View>
  );
}

/** "Customize Theme" sheet: font, bold, spacing, margins, columns, justify, sound. */
export function CustomizeSheet({ visible, colors, page, settings: s, sample, onChange, onReset, onClose }: Props) {
  const L = useLabels();
  const COLUMN_LABEL: Record<string, string> = { auto: L.columnsAuto, '1': L.columnsOne, '2': L.columnsTwo };
  const [fonts, setFonts] = useState(false);
  const [columnsMenu, setColumnsMenu] = useState(false);
  const off = !s.customize;
  const font = getFont(s.fontId);
  const previewFont = s.fontId === 'system' ? undefined : serifFont;
  const border = { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.separator };

  const sliderRow = (label: string, icon: IconName, value: number, min: number, max: number, step: number, show: string, key: keyof ReaderSettings) => (
    <View style={[styles.sliderBlock, border, off && styles.dim]} pointerEvents={off ? 'none' : 'auto'}>
      <Text style={[styles.caption, { color: colors.subtext }]}>{label}</Text>
      <View style={styles.sliderRow}>
        <Icon name={icon} color={colors.text} size={24} />
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Slider value={value} min={min} max={max} step={step} onChange={(v) => onChange({ [key]: v } as Partial<ReaderSettings>)} color={colors.text} track={colors.separator} thumbColor="#ffffff" />
        </View>
        <Text style={[styles.value, { color: colors.subtext }]}>{show}</Text>
      </View>
    </View>
  );

  const row = (icon: IconName, label: string, right: React.ReactNode, onPress?: () => void, top = true, iconActive = false) => {
    const content = (
      <>
        <View style={styles.rowIcon}>
          <Icon name={icon} color={colors.text} size={22} active={iconActive} />
        </View>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        {right}
      </>
    );
    return onPress ? (
      <Pressable style={[styles.line, top && border]} onPress={onPress}>
        {content}
      </Pressable>
    ) : (
      <View style={[styles.line, top && border]}>{content}</View>
    );
  };

  const close = () => {
    setFonts(false);
    setColumnsMenu(false);
    onClose();
  };

  return (
    <Sheet visible={visible} colors={colors} onClose={close} closeIcon="check" title={L.customizeTheme} height="92%">
      <View style={[styles.preview, { backgroundColor: page.bg }]}>
        <Text style={[styles.aa, { color: page.fg, fontFamily: previewFont }]}>Aa</Text>
        <Text
          numberOfLines={4}
          style={{
            color: page.fg, fontFamily: previewFont, fontSize: Math.min(s.fontSize, 22),
            lineHeight: Math.min(s.fontSize, 22) * (s.customize ? s.lineHeight : 1.5),
            fontWeight: s.bold ? '700' : '400', textAlign: s.justify ? 'justify' : 'auto'
          }}
        >
          {sample}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.pad}>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          {row(
            'textSize',
            L.font,
            <View style={styles.value2}>
              <Text style={{ color: colors.subtext, fontSize: 17 }}>{font.name}</Text>
              <Icon name={fonts ? 'chevronUp' : 'chevronRight'} color={colors.subtext} size={18} />
            </View>,
            () => setFonts((v) => !v),
            false
          )}
          {fonts &&
            FONTS.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => {
                  onChange({ fontId: f.id });
                  setFonts(false);
                }}
                style={[styles.line, border]}
              >
                <View style={styles.check}>{s.fontId === f.id && <Icon name="check" color={colors.text} size={20} />}</View>
                <Text style={[styles.label, { color: colors.text }]}>{f.name}</Text>
              </Pressable>
            ))}
          {row('bold', L.boldText, <Toggle value={s.bold} onValueChange={(v) => onChange({ bold: v })} trackColor={GREEN} />)}
        </View>

        <Text style={[styles.heading, { color: colors.text }]}>{L.accessibilityLayout}</Text>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          {row('sliders', L.customize, <Toggle value={s.customize} onValueChange={(v) => onChange({ customize: v })} trackColor={GREEN} />, undefined, false)}
          {sliderRow(L.lineSpacing, 'lineSpacing', s.lineHeight, 1.1, 2.2, 0.05, s.lineHeight.toFixed(2), 'lineHeight')}
          {sliderRow(L.characterSpacing, 'charSpacing', s.letterSpacing, -50, 100, 5, `${s.letterSpacing}%`, 'letterSpacing')}
          {sliderRow(L.wordSpacing, 'wordSpacing', s.wordSpacing, -50, 100, 5, `${s.wordSpacing}%`, 'wordSpacing')}
          {sliderRow(L.margins, 'margins', s.margins, -50, 100, 5, `${s.margins}%`, 'margins')}
        </View>

        <View style={[styles.group, { backgroundColor: colors.card, marginTop: 16 }]}>
          {row(
            'columns',
            L.columns,
            <View style={styles.value2}>
              <Text style={{ color: colors.subtext, fontSize: 17 }}>{COLUMN_LABEL[String(s.columns)]}</Text>
              <Icon name={columnsMenu ? 'chevronUp' : 'chevronDown'} color={colors.subtext} size={18} />
            </View>,
            () => setColumnsMenu((v) => !v),
            false
          )}
          {columnsMenu &&
            (['auto', 1, 2] as ColumnsSetting[]).map((c) => (
              <Pressable
                key={String(c)}
                style={[styles.line, border]}
                onPress={() => {
                  onChange({ columns: c });
                  setColumnsMenu(false);
                }}
              >
                <View style={styles.check}>{s.columns === c && <Icon name="check" color={colors.text} size={20} />}</View>
                <Text style={[styles.label, { color: colors.text }]}>{COLUMN_LABEL[String(c)]}</Text>
              </Pressable>
            ))}
          {row('justify', L.justifyText, <Toggle value={s.justify} onValueChange={(v) => onChange({ justify: v })} trackColor={GREEN} />)}
          {row(s.pageSound ? 'sound' : 'soundOff', L.pageTurnSound, <Toggle value={s.pageSound} onValueChange={(v) => onChange({ pageSound: v })} trackColor={GREEN} />)}
        </View>

        <Pressable onPress={onReset} style={[styles.reset, { backgroundColor: colors.card }]} accessibilityRole="button">
          <Text style={{ color: '#ff3b30', fontSize: 18, fontWeight: '600' }}>{L.resetTheme}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  preview: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 18, marginBottom: 10 },
  aa: { fontSize: 34, textAlign: 'right', marginBottom: 6 },
  pad: { paddingHorizontal: 16, paddingBottom: 40 },
  group: { borderRadius: 24, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 18 },
  rowIcon: { width: 34, height: 28, alignItems: 'flex-start', justifyContent: 'center' },
  toggleBox: { height: 31, minWidth: 51, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 18, lineHeight: 24 },
  check: { width: 34, height: 24, justifyContent: 'center' },
  value2: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heading: { fontSize: 22, fontWeight: '700', marginTop: 26, marginBottom: 10, marginStart: 4 },
  sliderBlock: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6 },
  dim: { opacity: 0.45 },
  caption: { fontSize: 14, marginBottom: 2 },
  sliderRow: { flexDirection: 'row', alignItems: 'center' },
  value: { width: 50, textAlign: 'right', fontSize: 17, lineHeight: 22 },
  reset: { marginTop: 18, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' }
});
