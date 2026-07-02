import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FieldWrapper } from './FieldWrapper';
import { colors, spacing, radii, typography } from '../../theme';
import type { CheckboxField as CheckboxFieldSchema } from '../../types';

interface Props {
  field: CheckboxFieldSchema;
  value: boolean | string[] | undefined;
  onChange: (v: boolean | string[]) => void;
}

export function CheckboxField({ field, value, onChange }: Props) {
  // Multi-checkbox mode
  if (field.options && field.options.length > 0) {
    const selected = (value as string[]) ?? [];
    function toggle(opt: string) {
      if (selected.includes(opt)) {
        onChange(selected.filter((o) => o !== opt));
      } else {
        onChange([...selected, opt]);
      }
    }
    return (
      <FieldWrapper label={field.label} helperText={field.helperText}>
        {field.options.map((opt) => (
          <Pressable key={opt} style={styles.row} onPress={() => toggle(opt)}>
            <Box checked={selected.includes(opt)} />
            <Text style={styles.label}>{opt}</Text>
          </Pressable>
        ))}
      </FieldWrapper>
    );
  }

  // Single yes/no
  const checked = !!value;
  return (
    <FieldWrapper label={field.label} helperText={field.helperText}>
      <Pressable style={styles.row} onPress={() => onChange(!checked)}>
        <Box checked={checked} />
        <Text style={styles.label}>{checked ? 'Yes' : 'No'}</Text>
      </Pressable>
    </FieldWrapper>
  );
}

function Box({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.box, checked && styles.boxChecked]}>
      {checked && <Feather name="check" size={14} color={colors.textInverse} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontSize: typography.sizes.md, color: colors.text },
});
