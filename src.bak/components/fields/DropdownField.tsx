import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FieldWrapper } from './FieldWrapper';
import { colors, spacing, radii, typography, shadows } from '../../theme';
import type { DropdownField as DropdownFieldSchema } from '../../types';

interface Props {
  field: DropdownFieldSchema;
  value: string | undefined;
  onChange: (v: string) => void;
}

export function DropdownField({ field, value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <FieldWrapper label={field.label} required={field.required} helperText={field.helperText}>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {value || 'Select…'}
        </Text>
        <Feather name="chevron-down" size={18} color={colors.textTertiary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <FlatList
              data={field.options}
              keyExtractor={(o) => o}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{item}</Text>
                  {value === item && <Feather name="check" size={18} color={colors.primary} />}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </FieldWrapper>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  triggerText: { fontSize: typography.sizes.md, color: colors.text },
  placeholder: { color: colors.textTertiary },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    maxHeight: '70%',
    ...shadows.modal,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  optionText: { fontSize: typography.sizes.md, color: colors.text },
});
