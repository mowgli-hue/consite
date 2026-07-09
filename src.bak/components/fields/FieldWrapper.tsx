/**
 * Shared field wrapper.
 *
 * All field components use this to render a consistent label + body + helper
 * layout. Field-specific UIs go in the children prop.
 */

import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface Props {
  label: string;
  required?: boolean;
  helperText?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function FieldWrapper({ label, required, helperText, children, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {children}
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  required: { color: colors.danger },
  helper: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
  },
});
