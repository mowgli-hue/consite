/**
 * Signature field.
 *
 * Uses react-native-signature-canvas (renders a WebView with a signature pad)
 * to capture a PNG signature. The result is a base64 data URL which we save
 * to Firebase Storage on submit, then store the storage path in values.
 *
 * For v0.1 we capture the base64 directly into values. v0.2 will move the
 * upload to onSubmit so values stays light.
 */

import { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Image } from 'react-native';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';
import { Feather } from '@expo/vector-icons';

import { FieldWrapper } from './FieldWrapper';
import { colors, spacing, radii, typography, shadows } from '../../theme';
import type { SignatureField as SignatureFieldSchema } from '../../types';

interface Props {
  field: SignatureFieldSchema;
  value: string | undefined; // base64 data URL for v0.1
  onChange: (v: string) => void;
}

export function SignatureField({ field, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<SignatureViewRef>(null);

  function handleOK(signature: string) {
    onChange(signature);
    setOpen(false);
  }

  return (
    <FieldWrapper label={field.label} required={field.required} helperText={field.helperText}>
      {value ? (
        <Pressable style={styles.preview} onPress={() => setOpen(true)}>
          <Image source={{ uri: value }} style={styles.image} resizeMode="contain" />
          <Text style={styles.editText}>Tap to re-sign</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.empty} onPress={() => setOpen(true)}>
          <Feather name="edit-3" size={20} color={colors.primary} />
          <Text style={styles.emptyText}>Tap to sign</Text>
        </Pressable>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sign here</Text>
            <Pressable hitSlop={8} onPress={() => setOpen(false)}>
              <Feather name="x" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.canvasWrap}>
            <SignatureScreen
              ref={ref}
              onOK={handleOK}
              autoClear={false}
              webStyle={canvasWebStyle}
              descriptionText=""
              clearText="Clear"
              confirmText="Save"
            />
          </View>
        </View>
      </Modal>
    </FieldWrapper>
  );
}

const canvasWebStyle = `
  .m-signature-pad { box-shadow: none; border: none; background: white; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: flex; justify-content: space-between; padding: 10px; }
  .m-signature-pad--footer .button { background-color: ${colors.primary}; color: white; }
  .m-signature-pad--footer .button.clear { background-color: ${colors.danger}; }
  body, html { background: white; }
`;

const styles = StyleSheet.create({
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingVertical: spacing.xl,
  },
  emptyText: { color: colors.primary, fontWeight: typography.weights.semibold },
  preview: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  image: { width: '100%', height: 80 },
  editText: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm },
  modalRoot: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  canvasWrap: { flex: 1, padding: spacing.lg },
});
