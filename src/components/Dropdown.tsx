/**
 * Dropdown — one tidy box instead of a wall of chips.
 *
 * Shows the current choice; tap to open a list (with a search box once
 * the list gets long). Works the same on phone and desktop.
 */

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radii, typography, shadows, touch } from '../theme';

export type DropdownOption = { value: string; label: string; hint?: string };

export function Dropdown({
  label, value, options, onChange, icon,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  icon?: keyof typeof Feather.glyphMap;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);

  function close() { setOpen(false); setQ(''); }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={styles.box} onPress={() => setOpen(true)}
        accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? 'choose'}`}
      >
        {icon && <Feather name={icon} size={16} color={colors.textSecondary} />}
        <Text style={styles.boxText} numberOfLines={1}>{current?.label ?? 'Choose…'}</Text>
        <Feather name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => { /* keep open */ }}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={close} hitSlop={8} accessibilityLabel="Close">
                <Feather name="x" size={22} color={colors.text} />
              </Pressable>
            </View>
            {options.length > 8 && (
              <TextInput
                style={styles.search} value={q} onChangeText={setQ} autoFocus
                placeholder="Type to search…" placeholderTextColor={colors.textTertiary}
              />
            )}
            <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              {shown.map((o) => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={o.value} style={[styles.option, on && styles.optionOn]}
                    onPress={() => { onChange(o.value); close(); }}
                  >
                    <Text style={[styles.optionText, on && styles.optionTextOn]} numberOfLines={1}>{o.label}</Text>
                    {!!o.hint && <Text style={styles.optionHint}>{o.hint}</Text>}
                    {on && <Feather name="check" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
              {shown.length === 0 && <Text style={styles.none}>Nothing matches.</Text>}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 180 },
  label: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs,
  },
  box: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touch.min,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingHorizontal: spacing.md,
  },
  boxText: { flex: 1, fontSize: typography.sizes.md, color: colors.text, fontWeight: typography.weights.semibold },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: {
    width: '100%', maxWidth: 440, backgroundColor: colors.surface, borderRadius: radii.lg,
    padding: spacing.lg, ...shadows.card,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  sheetTitle: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.background,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm,
    fontSize: typography.sizes.md, color: colors.text,
  },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touch.min,
    paddingHorizontal: spacing.md, borderRadius: radii.md,
  },
  optionOn: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1, fontSize: typography.sizes.md, color: colors.text },
  optionTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },
  optionHint: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  none: { padding: spacing.md, color: colors.textSecondary, fontSize: typography.sizes.sm },
});
