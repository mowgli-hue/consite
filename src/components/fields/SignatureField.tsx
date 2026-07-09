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

import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Image, Platform } from 'react-native';
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
            {Platform.OS === 'web' ? (
              <WebSignaturePad onSave={handleOK} />
            ) : (
              <SignatureScreen
                ref={ref}
                onOK={handleOK}
                autoClear={false}
                webStyle={canvasWebStyle}
                descriptionText=""
                clearText="Clear"
                confirmText="Save"
              />
            )}
          </View>
        </View>
      </Modal>
    </FieldWrapper>
  );
}

/**
 * Browser signature pad — plain HTML canvas with pointer events.
 * react-native-signature-canvas depends on react-native-webview,
 * which has no web implementation; this replaces it on web only.
 */
function WebSignaturePad({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasInk.current = true;
  }

  function up() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    hasInk.current = false;
  }

  function save() {
    if (!hasInk.current) return;
    onSave(canvasRef.current!.toDataURL('image/png'));
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={webPadStyles.canvasBox}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair', borderRadius: 8 }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
      </View>
      <View style={webPadStyles.row}>
        <Pressable style={[webPadStyles.btn, webPadStyles.btnClear]} onPress={clear}>
          <Text style={webPadStyles.btnClearText}>Clear</Text>
        </Pressable>
        <Pressable style={[webPadStyles.btn, webPadStyles.btnSave]} onPress={save}>
          <Text style={webPadStyles.btnSaveText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const webPadStyles = StyleSheet.create({
  canvasBox: {
    height: 260,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.md },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radii.md, alignItems: 'center' },
  btnClear: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger },
  btnClearText: { color: colors.danger, fontWeight: typography.weights.semibold },
  btnSave: { backgroundColor: colors.primary },
  btnSaveText: { color: colors.textInverse, fontWeight: typography.weights.semibold },
});

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
