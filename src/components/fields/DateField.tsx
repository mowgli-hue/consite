/**
 * Date / time field.
 *
 * v0.1: simple text input with ISO-style formatting. Replace with
 * @react-native-community/datetimepicker in v0.2 for native UX.
 *
 * Value is stored as ms epoch.
 */

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { FieldWrapper } from './FieldWrapper';
import { colors, spacing, radii, typography } from '../../theme';
import type { DateField as DateFieldSchema } from '../../types';

interface Props {
  field: DateFieldSchema;
  value: number | undefined;
  onChange: (v: number) => void;
}

export function DateField({ field, value, onChange }: Props) {
  const [text, setText] = useState(formatFromMs(value, field.mode));

  useEffect(() => {
    setText(formatFromMs(value, field.mode));
  }, [value, field.mode]);

  function commit() {
    const ms = parseToMs(text, field.mode);
    if (ms != null) onChange(ms);
  }

  return (
    <FieldWrapper label={field.label} required={field.required} helperText={field.helperText}>
      <View style={styles.wrap}>
        <Feather name={field.mode === 'time' ? 'clock' : 'calendar'} size={18} color={colors.textTertiary} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          onEndEditing={commit}
          placeholder={placeholderFor(field.mode)}
          placeholderTextColor={colors.textTertiary}
        />
        <Pressable hitSlop={8} onPress={() => onChange(Date.now())}>
          <Text style={styles.now}>Now</Text>
        </Pressable>
      </View>
    </FieldWrapper>
  );
}

function formatFromMs(ms: number | undefined, mode: 'date' | 'time' | 'datetime'): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (mode === 'date') return d.toLocaleDateString();
  if (mode === 'time') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString();
}

function parseToMs(text: string, _mode: string): number | null {
  if (!text.trim()) return null;
  const ms = Date.parse(text);
  return isNaN(ms) ? null : ms;
}

function placeholderFor(mode: 'date' | 'time' | 'datetime'): string {
  if (mode === 'date') return 'YYYY-MM-DD';
  if (mode === 'time') return 'HH:MM';
  return 'YYYY-MM-DD HH:MM';
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    gap: spacing.sm,
  },
  input: { flex: 1, fontSize: typography.sizes.md, color: colors.text },
  now: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    fontSize: typography.sizes.sm,
  },
});
