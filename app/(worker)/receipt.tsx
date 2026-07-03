/**
 * Receipt scanner — photo of receipt → structured job-cost line item.
 *
 * Worker buys materials at Home Depot. Snaps a photo of the receipt.
 * AI extracts vendor, date, total, GST/PST split (BC-aware), category,
 * and line items. Worker confirms the project + cost code, taps Save.
 *
 * Goes to /projects/{pid}/expenses/{id}. From there it can export to
 * QuickBooks (v0.4) or stay as a job-cost record.
 *
 * Replaces: shoebox of receipts and the foreman's weekly spreadsheet.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { analyzeReceipt } from '../../src/lib/ai';
import { AIFilledBanner } from '../../src/components/AIFilledBanner';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { ReceiptResult } from '../../src/lib/ai';

type Phase = 'capture' | 'analyzing' | 'review' | 'submitting' | 'done';

const CATEGORIES = [
  'lumber',
  'fasteners',
  'electrical',
  'plumbing',
  'tools',
  'ppe',
  'fuel',
  'other',
];

export default function ReceiptScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptResult | null>(null);
  const [costCode, setCostCode] = useState<string>('');

  async function captureReceipt(source: 'camera' | 'library') {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant access.');
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
          });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);

    setPhase('analyzing');
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const r = await analyzeReceipt({
        imageBase64: b64,
        imageMediaType: 'image/jpeg',
      });
      setReceipt(r);
      setPhase('review');
    } catch (err: any) {
      console.warn('Receipt analysis failed', err);
      Alert.alert('Could not read receipt', err.message ?? 'Try a clearer photo.');
      setPhase('capture');
    }
  }

  async function handleSave() {
    if (!receipt || !user || !projectId) return;
    setPhase('submitting');
    try {
      await addDoc(collection(db, 'projects', projectId, 'expenses'), {
        ...receipt,
        photoUri: imageUri, // v0.3 uploads to Storage
        costCode: costCode || null,
        recordedBy: user.uid,
        recordedAt: serverTimestamp(),
        aiAssisted: true,
      });
      setPhase('done');
      setTimeout(() => router.back(), 1200);
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Try again.');
      setPhase('review');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Scan receipt</Text>
      </View>

      {phase === 'capture' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.heroCard}>
            <View style={styles.iconCircle}>
              <Feather name="file-text" size={28} color={colors.primary} />
            </View>
            <Text style={styles.heroTitle}>Snap a receipt</Text>
            <Text style={styles.heroSubtitle}>
              Home Depot, Lowe's, Dick's Lumber — anything. AI pulls vendor, total, GST/PST split, and line items. Goes straight to job costing.
            </Text>
          </View>

          <Pressable style={styles.bigButton} onPress={() => captureReceipt('camera')}>
            <Feather name="camera" size={20} color={colors.textInverse} />
            <Text style={styles.bigButtonText}>Take photo</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => captureReceipt('library')}
          >
            <Feather name="image" size={18} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Choose from library</Text>
          </Pressable>
        </ScrollView>
      )}

      {phase === 'analyzing' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.phaseLabel}>Reading the receipt…</Text>
          <Text style={styles.phaseSub}>Extracting vendor, amounts, line items</Text>
        </View>
      )}

      {(phase === 'review' || phase === 'submitting') && receipt && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <AIFilledBanner
            confidence={receipt.confidence}
            notes="Tap any value to fix what AI got wrong before saving."
          />

          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.receiptPhoto} />
          )}

          <View style={styles.summaryCard}>
            <Row label="Vendor" value={receipt.vendor ?? '—'} />
            <Row label="Date" value={receipt.date ?? '—'} />
            <Row label="Category" value={receipt.category} />
            <Divider />
            <Row label="Subtotal" value={fmt(receipt.subtotalCents)} />
            <Row label="GST" value={fmt(receipt.gstCents)} />
            <Row label="PST" value={fmt(receipt.pstCents)} />
            <Divider />
            <Row label="Total" value={fmt(receipt.totalCents)} bold />
          </View>

          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.pillRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.pill, receipt.category === c && styles.pillActive]}
                onPress={() => setReceipt({ ...receipt, category: c })}
              >
                <Text
                  style={[
                    styles.pillText,
                    receipt.category === c && styles.pillTextActive,
                  ]}
                >
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Cost code (optional)</Text>
          <TextInput
            style={styles.input}
            value={costCode}
            onChangeText={setCostCode}
            placeholder="e.g. 02-100 framing"
            placeholderTextColor={colors.textTertiary}
          />

          {receipt.lineItems.length > 0 && (
            <>
              <Text style={styles.fieldLabel}>Line items</Text>
              <View style={styles.lineItemsCard}>
                {receipt.lineItems.map((li, i) => (
                  <View key={i} style={styles.lineItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineItemDesc}>{li.description}</Text>
                      <Text style={styles.lineItemQty}>{li.qtyOrUnit}</Text>
                    </View>
                    <Text style={styles.lineItemAmount}>{fmt(li.amountCents)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Pressable
            style={[styles.submitButton, phase === 'submitting' && { opacity: 0.6 }]}
            disabled={phase === 'submitting'}
            onPress={handleSave}
          >
            {phase === 'submitting' ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <>
                <Feather name="check" size={18} color={colors.textInverse} />
                <Text style={styles.submitButtonText}>Save to job cost</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}

      {phase === 'done' && (
        <View style={styles.center}>
          <View style={[styles.iconCircle, { backgroundColor: colors.success }]}>
            <Feather name="check" size={32} color={colors.textInverse} />
          </View>
          <Text style={styles.phaseLabel}>Saved to job cost</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, bold && { fontWeight: typography.weights.bold, fontSize: typography.sizes.lg }]}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function fmt(cents: number | null): string {
  if (cents == null) return '—';
  return '$' + (cents / 100).toFixed(2);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  phaseLabel: { color: colors.textSecondary, fontSize: typography.sizes.md, textAlign: 'center' },
  phaseSub: { color: colors.textTertiary, fontSize: typography.sizes.sm, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heroTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },

  bigButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  bigButtonText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },

  secondaryButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.medium },

  receiptPhoto: {
    width: '100%',
    aspectRatio: 3 / 4,
    maxHeight: 280,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.lg,
    resizeMode: 'cover',
  },

  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  summaryValue: { fontSize: typography.sizes.md, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: typography.sizes.sm, color: colors.text, textTransform: 'capitalize' },
  pillTextActive: { color: colors.textInverse, fontWeight: typography.weights.semibold },

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

  lineItemsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  lineItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineItemDesc: { fontSize: typography.sizes.sm, color: colors.text },
  lineItemQty: { fontSize: typography.sizes.xs, color: colors.textTertiary, marginTop: 2 },
  lineItemAmount: {
    fontSize: typography.sizes.sm,
    color: colors.text,
    fontWeight: typography.weights.medium,
  },

  submitButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  submitButtonText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
