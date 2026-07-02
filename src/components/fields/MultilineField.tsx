import { TextInput, StyleSheet } from 'react-native';
import { FieldWrapper } from './FieldWrapper';
import { colors, spacing, radii, typography } from '../../theme';
import type { MultilineField as MultilineFieldSchema } from '../../types';

interface Props {
  field: MultilineFieldSchema;
  value: string | undefined;
  onChange: (v: string) => void;
}

export function MultilineField({ field, value, onChange }: Props) {
  const minHeight = (field.rows ?? 4) * 22;
  return (
    <FieldWrapper label={field.label} required={field.required} helperText={field.helperText}>
      <TextInput
        style={[styles.input, { minHeight }]}
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline
        textAlignVertical="top"
      />
    </FieldWrapper>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
  },
});
