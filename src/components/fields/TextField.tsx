import { TextInput, StyleSheet } from 'react-native';
import { FieldWrapper } from './FieldWrapper';
import { colors, spacing, radii, typography } from '../../theme';
import type { TextField as TextFieldSchema } from '../../types';

interface Props {
  field: TextFieldSchema;
  value: string | undefined;
  onChange: (v: string) => void;
}

export function TextField({ field, value, onChange }: Props) {
  return (
    <FieldWrapper label={field.label} required={field.required} helperText={field.helperText}>
      <TextInput
        style={styles.input}
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor={colors.textTertiary}
        maxLength={field.maxLength}
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
